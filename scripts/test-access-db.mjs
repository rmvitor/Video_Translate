import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
const execute=promisify(execFile), container=`entrelinhas-access-test-${crypto.randomUUID()}`;
const image='postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
let created=false;
const sql=input=>new Promise((resolve,reject)=>{const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});let err='';child.stderr.on('data',chunk=>err+=chunk);child.stdout.resume();child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(err)));child.stdin.end(input);});
try{
 await execute('docker',['run','--detach','--name',container,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
 let ready=false;for(let retry=0;retry<60;retry++){try{await execute('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}}
 if(!ready)throw new Error('PostgreSQL did not become ready');
 await sql(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth,public to authenticated,anon,service_role;`);
 const migrations=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
 await sql(await readFile('supabase/migrations/'+migrations[0],'utf8'));
 await sql(await readFile('tests/access-db.sql','utf8'));
 // Upgrade a working installation with an existing master, users, sessions and audit records.
 await sql(`update auth.users set raw_user_meta_data=raw_user_meta_data||'{"contact":"Contato anterior"}'::jsonb where id='00000000-0000-4000-8000-000000000002';`);
 for(const name of migrations.slice(1))await sql(await readFile('supabase/migrations/'+name,'utf8'));
 await sql(await readFile('tests/commercial-access-db.sql','utf8'));
 console.log('Real PostgreSQL checks passed: master bootstrap, approval, block/reapproval, revocation, expiry, session time, audit, RLS and denied privilege escalation.');
}finally{if(created)await execute('docker',['rm','--force',container]);}
