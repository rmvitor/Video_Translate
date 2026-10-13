-- Synthetic accounts only. The production migration is executed before these assertions.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000001','master@example.test',now(),'{"display_name":"Master"}'),
 ('00000000-0000-4000-8000-000000000002','user@example.test',now(),'{"role":"master","display_name":"User"}'),
 ('00000000-0000-4000-8000-000000000003','unconfirmed@example.test',null,'{}');
select public.bootstrap_access_master('master@example.test');
do $$ begin
 assert (select role='user' and status='pending' from public.access_profiles where email='user@example.test'),'Metadata must not assign master';
 assert (public.check_access('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','start')->>'reason')='pending';
 assert (public.check_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','start','203.0.113.42','fixture','Test browser')->>'allowed')::boolean;
end $$;
select public.manage_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','update','{"user_id":"00000000-0000-4000-8000-000000000002","status":"active","session_minutes":60}');
do $$ declare answer jsonb;begin
 answer:=public.check_access('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','start','203.0.113.43','fixture','Test browser');
 assert (answer->>'allowed')::boolean;
 assert (answer->>'lease_seconds')::integer<=65;
 assert public.check_access('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004','start')->>'reason'='unconfirmed';
 begin perform public.manage_access('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','list');raise exception 'Ordinary user was allowed to manage';exception when insufficient_privilege then null;end;
 begin perform public.bootstrap_access_master('user@example.test');raise exception 'Multiple masters allowed';exception when raise_exception then if sqlerrm='Multiple masters allowed' then raise;end if;end;
end $$;
update public.access_sessions set last_seen_at=now()-interval '30 seconds' where id='10000000-0000-4000-8000-000000000003';
select public.check_access('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','heartbeat','203.0.113.43','fixture');
do $$ begin assert (select active_seconds>=29 and active_seconds<=65 from public.access_sessions where id='10000000-0000-4000-8000-000000000003');end $$;
select public.manage_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','update','{"user_id":"00000000-0000-4000-8000-000000000002","status":"blocked","session_minutes":60}');
do $$ begin assert public.check_access('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','heartbeat')->>'reason'='blocked';end $$;
select public.manage_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','update','{"user_id":"00000000-0000-4000-8000-000000000002","status":"active","session_minutes":60}');
do $$ begin
 assert public.check_access('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','start')->>'reason'='session_expired','Old sessions must stay revoked after reapproval';
 assert (public.check_access('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','start')->>'allowed')::boolean;
end $$;
update public.access_profiles set expires_at=now()-interval '1 minute' where id='00000000-0000-4000-8000-000000000002';
do $$ begin assert public.check_access('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','heartbeat')->>'reason'='expired';end $$;
update public.access_profiles set expires_at=null, starts_at=now()+interval '1 hour' where id='00000000-0000-4000-8000-000000000002';
do $$ begin assert public.check_access('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000006','start')->>'reason'='not_started';end $$;
select public.manage_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','list');
select public.manage_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','history');
-- Direct client privilege and RLS checks. Errors are expected and asserted, not ignored.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
do $$ begin
 assert (select count(*)=1 from public.access_profiles),'RLS must expose only own profile';
 begin update public.access_profiles set role='master';raise exception 'Client profile write allowed';exception when insufficient_privilege then null;end;
 begin perform public.check_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','start');raise exception 'Client spoofed actor';exception when insufficient_privilege then null;end;
 begin perform public.manage_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','list');raise exception 'Client spoofed master';exception when insufficient_privilege then null;end;
 begin perform public.bootstrap_access_master('user@example.test');raise exception 'Client bootstrap allowed';exception when insufficient_privilege then null;end;
 begin perform * from public.access_audit;raise exception 'Client audit read allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'Access SQL checks passed' as result;
