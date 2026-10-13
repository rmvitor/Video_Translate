begin;
create table public.access_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'user' check (role in ('user','master')),
  status text not null default 'pending' check (status in ('pending','active','blocked')),
  starts_at timestamptz,
  expires_at timestamptz,
  session_minutes integer not null default 480 check (session_minutes between 5 and 1440),
  access_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);
create unique index one_access_master on public.access_profiles(role) where role='master';
create table public.access_sessions (
  id uuid primary key,
  user_id uuid not null references public.access_profiles(id) on delete cascade,
  access_version integer not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  deadline timestamptz not null,
  closed_at timestamptz,
  active_seconds integer not null default 0,
  ip inet,
  ip_source text,
  user_agent text not null default ''
);
create index access_sessions_user on public.access_sessions(user_id,started_at desc);
create table public.access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  ip inet,
  ip_source text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index access_audit_time on public.access_audit(created_at desc);
create index access_audit_user on public.access_audit(user_id,created_at desc);
-- No training files, transcripts, project titles, backup contents or API keys in these tables.
alter table public.access_profiles enable row level security;
alter table public.access_sessions enable row level security;
alter table public.access_audit enable row level security;
revoke all on public.access_profiles, public.access_sessions, public.access_audit from anon, authenticated;
grant select on public.access_profiles to authenticated;
create policy own_access_profile on public.access_profiles for select to authenticated using (id=auth.uid());
grant all on public.access_profiles, public.access_sessions, public.access_audit to service_role;
grant usage,select on sequence public.access_audit_id_seq to service_role;

create function public.new_access_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.access_profiles(id,email,display_name) values(new.id,new.email,left(coalesce(new.raw_user_meta_data->>'display_name',''),120)) on conflict(id) do nothing;
  insert into public.access_audit(actor_id,user_id,event) values(new.id,new.id,'registration');
  return new;
end $$;
revoke all on function public.new_access_profile() from public,anon,authenticated;
create trigger on_access_registration after insert on auth.users for each row execute function public.new_access_profile();

-- Executed only by the SQL Editor/owner. Never callable by a browser or service-role API.
create function public.bootstrap_access_master(master_email text) returns uuid language plpgsql security definer set search_path='' as $$
declare target auth.users; result uuid;
begin
  if exists(select 1 from public.access_profiles where role='master') then raise exception 'O usuário master já foi definido.'; end if;
  select * into target from auth.users where lower(email)=lower(trim(master_email)) and email_confirmed_at is not null;
  if target.id is null then raise exception 'Crie e confirme a conta master primeiro.'; end if;
  insert into public.access_profiles(id,email,display_name) values(target.id,target.email,left(coalesce(target.raw_user_meta_data->>'display_name',''),120)) on conflict(id) do nothing;
  update public.access_profiles set role='master',status='active',starts_at=null,expires_at=null,updated_at=now(),access_version=access_version+1 where id=target.id returning id into result;
  insert into public.access_audit(user_id,event) values(result,'master_bootstrap');
  return result;
end $$;
revoke all on function public.bootstrap_access_master(text) from public,anon,authenticated,service_role;

create function public.check_access(actor uuid, auth_session uuid, operation text, observed_ip text default null, ip_source text default null, agent text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare profile public.access_profiles; session public.access_sessions; reason text; client_ip inet; clock_time timestamptz:=clock_timestamp();
begin
  if operation not in ('start','heartbeat','logout') or auth_session is null then raise exception 'Invalid access operation'; end if;
  begin client_ip:=observed_ip::inet; exception when invalid_text_representation then client_ip:=null; end;
  -- Supports Auth accounts that existed before this migration. Identity comes from verified Auth.
  insert into public.access_profiles(id,email,display_name)
    select id,email,left(coalesce(raw_user_meta_data->>'display_name',''),120) from auth.users where id=actor on conflict(id) do nothing;
  select * into profile from public.access_profiles where id=actor for update;
  if profile.id is null then raise exception 'Unknown account'; end if;
  if operation='logout' then
    update public.access_sessions set closed_at=coalesce(closed_at,clock_time) where id=auth_session and user_id=actor;
    insert into public.access_audit(actor_id,user_id,event,ip,ip_source) values(actor,actor,'logout',client_ip,left(ip_source,50));
    return jsonb_build_object('allowed',false,'reason','signed_out');
  end if;
  if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then reason:='unconfirmed';
  elsif profile.status<>'active' then reason:=profile.status;
  elsif profile.starts_at is not null and profile.starts_at>clock_time then reason:='not_started';
  elsif profile.expires_at is not null and profile.expires_at<=clock_time then reason:='expired'; end if;
  if reason is not null then
    update public.access_sessions set closed_at=coalesce(closed_at,clock_time) where user_id=actor and closed_at is null;
    -- Avoid an audit flood from repeated heartbeat retries.
    if operation='start' then insert into public.access_audit(actor_id,user_id,event,ip,ip_source,details) values(actor,actor,'access_denied',client_ip,left(ip_source,50),jsonb_build_object('reason',reason)); end if;
    return jsonb_build_object('allowed',false,'reason',reason,'profile',jsonb_build_object('id',profile.id,'email',profile.email,'status',profile.status,'role',profile.role));
  end if;
  select * into session from public.access_sessions where id=auth_session for update;
  if session.id is null and operation='start' then
    insert into public.access_sessions(id,user_id,access_version,deadline,ip,ip_source,user_agent)
      values(auth_session,actor,profile.access_version,least(clock_time+make_interval(mins=>profile.session_minutes),coalesce(profile.expires_at,'infinity')),client_ip,left(ip_source,50),left(agent,300)) returning * into session;
    insert into public.access_audit(actor_id,user_id,event,ip,ip_source) values(actor,actor,'access_granted',client_ip,left(ip_source,50));
  end if;
  if session.id is null or session.user_id<>actor or session.closed_at is not null or session.access_version<>profile.access_version or session.deadline<=clock_time then
    update public.access_sessions set closed_at=coalesce(closed_at,clock_time) where id=auth_session and user_id=actor;
    return jsonb_build_object('allowed',false,'reason','session_expired');
  end if;
  if operation='heartbeat' then
    update public.access_sessions set active_seconds=active_seconds+greatest(0,least(65,floor(extract(epoch from clock_time-last_seen_at))::integer)),last_seen_at=clock_time,ip=client_ip,ip_source=left(check_access.ip_source,50) where id=auth_session returning * into session;
  end if;
  return jsonb_build_object('allowed',true,'lease_seconds',greatest(1,least(65,floor(extract(epoch from session.deadline-clock_time))::integer)),
    'profile',jsonb_build_object('id',profile.id,'email',profile.email,'display_name',profile.display_name,'role',profile.role,'status',profile.status,'expires_at',profile.expires_at),
    'session',jsonb_build_object('started_at',session.started_at,'deadline',session.deadline));
end $$;
revoke all on function public.check_access(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.check_access(uuid,uuid,text,text,text,text) to service_role;

create function public.manage_access(actor uuid, auth_session uuid, operation text, params jsonb default '{}', observed_ip text default null, ip_source text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare verified jsonb; target uuid; state text; client_ip inet; changed public.access_profiles; result jsonb; start_at timestamptz; end_at timestamptz; minutes integer; skip integer;
begin
  verified:=public.check_access(actor,auth_session,'heartbeat',observed_ip,ip_source);
  if coalesce((verified->>'allowed')::boolean,false)=false or verified#>>'{profile,role}'<>'master' then raise insufficient_privilege using message='Master access required'; end if;
  begin client_ip:=observed_ip::inet; exception when invalid_text_representation then client_ip:=null; end;
  skip:=greatest(0,least(100000,coalesce((params->>'offset')::integer,0)));
  if operation='list' then
    select jsonb_build_object('users',coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb)) into result from (
      select p.*,coalesce(s.active_seconds,0) as active_seconds,s.last_seen_at,s.last_ip
      from public.access_profiles p left join lateral (
        select sum(active_seconds)::bigint as active_seconds,max(last_seen_at) as last_seen_at,(array_agg(ip::text order by last_seen_at desc))[1] as last_ip from public.access_sessions where user_id=p.id
      ) s on true where (coalesce(params->>'search','')='' or p.email ilike '%'||left(params->>'search',120)||'%' or p.display_name ilike '%'||left(params->>'search',120)||'%') order by p.created_at desc limit 50 offset skip
    ) row;
    return result||jsonb_build_object('counts',(select jsonb_build_object('total',count(*),'pending',count(*) filter(where status='pending'),'active',count(*) filter(where status='active'),'blocked',count(*) filter(where status='blocked')) from public.access_profiles));
  elsif operation='history' then
    target:=(params->>'user_id')::uuid;
    return jsonb_build_object('sessions',(select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) from (select * from public.access_sessions where target is null or user_id=target order by started_at desc limit 50 offset skip) row),
      'events',(select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) from (select * from public.access_audit where target is null or user_id=target order by created_at desc limit 50 offset skip) row));
  elsif operation in ('update','revoke') then
    target:=(params->>'user_id')::uuid;
    select * into changed from public.access_profiles where id=target for update;
    if changed.id is null or changed.role='master' then raise exception 'A conta master não pode ser modificada pelo painel.'; end if;
    if operation='update' then
      state:=params->>'status'; start_at:=nullif(params->>'starts_at','')::timestamptz; end_at:=nullif(params->>'expires_at','')::timestamptz; minutes:=(params->>'session_minutes')::integer;
      if state not in ('pending','active','blocked') or state is null or minutes is null or minutes not between 5 and 1440 or (end_at is not null and start_at is not null and end_at<=start_at) then raise exception 'Política de acesso inválida.'; end if;
      update public.access_profiles set status=state,starts_at=start_at,expires_at=end_at,session_minutes=minutes,access_version=access_version+1,updated_at=now() where id=target;
    else update public.access_profiles set access_version=access_version+1,updated_at=now() where id=target; end if;
    update public.access_sessions set closed_at=coalesce(closed_at,clock_timestamp()) where user_id=target and closed_at is null;
    insert into public.access_audit(actor_id,user_id,event,ip,ip_source,details) values(actor,target,case when operation='revoke' then 'sessions_revoked' else 'policy_updated' end,client_ip,left(ip_source,50),case when operation='revoke' then '{}'::jsonb else jsonb_build_object('status',state,'starts_at',start_at,'expires_at',end_at,'session_minutes',minutes) end);
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Invalid admin operation';
end $$;
revoke all on function public.manage_access(uuid,uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.manage_access(uuid,uuid,text,jsonb,text,text) to service_role;
commit;
