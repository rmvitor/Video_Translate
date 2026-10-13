begin;
-- Upgrade in place: accounts, master, sessions and local libraries are preserved.
alter table public.access_profiles add column contact text not null default '' check(length(contact)<=120);
alter table public.access_profiles drop constraint access_profiles_status_check;
alter table public.access_profiles add constraint access_profiles_status_check check(status in ('pending','active','blocked','removed'));
update public.access_profiles p set contact=left(coalesce(u.raw_user_meta_data->>'contact',''),120) from auth.users u where p.id=u.id;

-- Internal commercial records are visible only through authorized master operations.
create table public.access_customer_details (
  user_id uuid primary key references public.access_profiles(id) on delete cascade,
  plan_name text not null default '' check(length(plan_name)<=80),
  billing_status text not null default 'unassigned' check(billing_status in ('unassigned','trial','paid','overdue')),
  amount_cents integer not null default 0 check(amount_cents between 0 and 100000000),
  next_payment_at timestamptz,
  notes text not null default '' check(length(notes)<=2000),
  updated_at timestamptz not null default now()
);
alter table public.access_customer_details enable row level security;
revoke all on public.access_customer_details from public,anon,authenticated;
grant all on public.access_customer_details to service_role;

create or replace function public.new_access_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.access_profiles(id,email,display_name,contact)
    values(new.id,new.email,left(coalesce(new.raw_user_meta_data->>'display_name',''),120),left(coalesce(new.raw_user_meta_data->>'contact',''),120)) on conflict(id) do nothing;
  insert into public.access_audit(actor_id,user_id,event) values(new.id,new.id,'registration');
  return new;
end $$;

create or replace function public.manage_access(actor uuid, auth_session uuid, operation text, params jsonb default '{}', observed_ip text default null, ip_source text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare verified jsonb; target uuid; state text; client_ip inet; changed public.access_profiles; customer public.access_customer_details; result jsonb; start_at timestamptz; end_at timestamptz; minutes integer; skip integer; filter_status text;
begin
  verified:=public.check_access(actor,auth_session,'heartbeat',observed_ip,ip_source);
  if coalesce((verified->>'allowed')::boolean,false)=false or verified#>>'{profile,role}'<>'master' then raise insufficient_privilege using message='Master access required'; end if;
  begin client_ip:=observed_ip::inet; exception when invalid_text_representation then client_ip:=null; end;
  skip:=greatest(0,least(100000,coalesce((params->>'offset')::integer,0)));
  if operation='invite_authorize' then return jsonb_build_object('ok',true);
  elsif operation='list' then
    filter_status:=coalesce(params->>'status','all');
    if filter_status not in ('all','pending','active','blocked','removed','expired') then raise exception 'Filtro inválido.'; end if;
    select jsonb_build_object('users',coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb)) into result from (
      select p.*,c.plan_name,c.billing_status,c.amount_cents,c.next_payment_at,c.notes,
        case when p.status='active' and p.expires_at<=clock_timestamp() then 'expired' else p.status end as access_state,
        coalesce(s.active_seconds,0) as active_seconds,s.last_seen_at,s.last_ip
      from public.access_profiles p left join public.access_customer_details c on c.user_id=p.id left join lateral (
        select sum(active_seconds)::bigint as active_seconds,max(last_seen_at) as last_seen_at,(array_agg(ip::text order by last_seen_at desc))[1] as last_ip from public.access_sessions where user_id=p.id
      ) s on true where
        (coalesce(params->>'search','')='' or p.email ilike '%'||left(params->>'search',120)||'%' or p.display_name ilike '%'||left(params->>'search',120)||'%' or p.contact ilike '%'||left(params->>'search',120)||'%')
        and (filter_status='all' or (filter_status='expired' and p.status='active' and p.expires_at<=clock_timestamp()) or (p.status=filter_status and (filter_status<>'active' or p.expires_at is null or p.expires_at>clock_timestamp())))
      order by p.created_at desc limit 50 offset skip
    ) row;
    return result||jsonb_build_object('schema_version',2,'counts',(select jsonb_build_object('total',count(*),'pending',count(*) filter(where status='pending'),'active',count(*) filter(where status='active' and (expires_at is null or expires_at>clock_timestamp())),'blocked',count(*) filter(where status='blocked'),'removed',count(*) filter(where status='removed'),'expired',count(*) filter(where status='active' and expires_at<=clock_timestamp())) from public.access_profiles));
  elsif operation='history' then
    target:=(params->>'user_id')::uuid;
    return jsonb_build_object('sessions',(select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) from (select * from public.access_sessions where target is null or user_id=target order by started_at desc limit 50 offset skip) row),
      'events',(select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) from (select * from public.access_audit where target is null or user_id=target order by created_at desc limit 50 offset skip) row));
  elsif operation in ('update','revoke','remove','invite_record') then
    target:=(params->>'user_id')::uuid;
    select * into changed from public.access_profiles where id=target for update;
    if changed.id is null or changed.role='master' then raise exception 'A conta master não pode ser modificada pelo painel.'; end if;
    if operation='invite_record' then
      insert into public.access_audit(actor_id,user_id,event,ip,ip_source) values(actor,target,'invitation_sent',client_ip,left(ip_source,50));
      return jsonb_build_object('ok',true);
    elsif operation='update' then
      state:=params->>'status'; start_at:=nullif(params->>'starts_at','')::timestamptz; end_at:=nullif(params->>'expires_at','')::timestamptz; minutes:=(params->>'session_minutes')::integer;
      if state not in ('pending','active','blocked') or state is null or minutes is null or minutes not between 5 and 1440 or (end_at is not null and start_at is not null and end_at<=start_at) then raise exception 'Política de acesso inválida.'; end if;
      if length(coalesce(params->>'display_name',''))>120 or length(coalesce(params->>'contact',''))>120 then raise exception 'Dados de cadastro inválidos.'; end if;
      update public.access_profiles set status=state,starts_at=start_at,expires_at=end_at,session_minutes=minutes,
        display_name=case when params?'display_name' then coalesce(params->>'display_name','') else display_name end,
        contact=case when params?'contact' then coalesce(params->>'contact','') else contact end,
        access_version=access_version+1,updated_at=now() where id=target;
      if params ?| array['plan_name','billing_status','amount_cents','next_payment_at','notes'] then
        select * into customer from public.access_customer_details where user_id=target;
        insert into public.access_customer_details(user_id,plan_name,billing_status,amount_cents,next_payment_at,notes)
          values(target,coalesce(params->>'plan_name',customer.plan_name,''),coalesce(params->>'billing_status',customer.billing_status,'unassigned'),coalesce((params->>'amount_cents')::integer,customer.amount_cents,0),
            case when params?'next_payment_at' then nullif(params->>'next_payment_at','')::timestamptz else customer.next_payment_at end,coalesce(params->>'notes',customer.notes,''))
          on conflict(user_id) do update set plan_name=excluded.plan_name,billing_status=excluded.billing_status,amount_cents=excluded.amount_cents,next_payment_at=excluded.next_payment_at,notes=excluded.notes,updated_at=now();
      end if;
    elsif operation='remove' then
      update public.access_profiles set status='removed',access_version=access_version+1,updated_at=now() where id=target;
    else update public.access_profiles set access_version=access_version+1,updated_at=now() where id=target; end if;
    update public.access_sessions set closed_at=coalesce(closed_at,clock_timestamp()) where user_id=target and closed_at is null;
    insert into public.access_audit(actor_id,user_id,event,ip,ip_source,details) values(actor,target,
      case operation when 'revoke' then 'sessions_revoked' when 'remove' then 'access_removed' else 'policy_updated' end,client_ip,left(ip_source,50),
      case when operation='update' then jsonb_build_object('status',state,'starts_at',start_at,'expires_at',end_at,'session_minutes',minutes) else '{}'::jsonb end);
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Invalid admin operation';
end $$;
revoke all on function public.manage_access(uuid,uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.manage_access(uuid,uuid,text,jsonb,text,text) to service_role;
commit;
