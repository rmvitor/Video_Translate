-- The upgrade must preserve the existing master and prevent client access to commercial notes.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000004','customer@example.test',now(),'{"display_name":"Customer","contact":"+55 11 90000-0000","role":"master"}');
do $$ begin
 assert (select count(*)=1 from public.access_profiles where role='master');
 assert (select contact='+55 11 90000-0000' and role='user' and status='pending' from public.access_profiles where id='00000000-0000-4000-8000-000000000004');
 assert public.manage_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','list','{"status":"pending"}')->>'schema_version'='2';
 assert (public.manage_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','invite_authorize')->>'ok')::boolean;
end $$;
select public.manage_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','update','{"user_id":"00000000-0000-4000-8000-000000000004","status":"active","session_minutes":30,"plan_name":"Mensal","billing_status":"paid","amount_cents":4990,"notes":"Registro comercial privado"}');
do $$ declare answer jsonb;begin
 answer:=public.check_access('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000007','start');
 assert (answer->>'allowed')::boolean;
 assert not answer?'notes' and not (answer->'profile')?'notes','Commercial fields must not enter user authorization';
 assert (select plan_name='Mensal' and amount_cents=4990 from public.access_customer_details where user_id='00000000-0000-4000-8000-000000000004');
 begin perform public.manage_access('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000007','invite_authorize');raise exception 'Ordinary account authorized invitation';exception when insufficient_privilege then null;end;
 begin perform public.manage_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','remove','{"user_id":"00000000-0000-4000-8000-000000000001"}');raise exception 'Master removed itself';exception when raise_exception then if sqlerrm='Master removed itself' then raise;end if;end;
end $$;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';
do $$ begin
 begin perform * from public.access_customer_details;raise exception 'User read commercial notes';exception when insufficient_privilege then null;end;
end $$;
reset role;
select public.manage_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','remove','{"user_id":"00000000-0000-4000-8000-000000000004"}');
do $$ begin
 assert public.check_access('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000007','start')->>'reason'='removed';
 assert (select count(*)=1 from auth.users where id='00000000-0000-4000-8000-000000000004'),'Removing access must preserve the identity';
 assert (select count(*)=1 from public.access_customer_details where user_id='00000000-0000-4000-8000-000000000004');
end $$;
