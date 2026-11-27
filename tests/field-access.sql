\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create schema auth;
create table auth.users (
  id uuid primary key, email text, email_confirmed_at timestamptz, is_anonymous boolean default false
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table public.locations (id bigint primary key);
create table public.parameters (id bigint primary key);
create table public.samplingdates (id bigint generated always as identity primary key, date date);
create table public.data (locationid bigint, dateid bigint, parameterid bigint, value numeric);
insert into public.locations values (4);
insert into public.parameters values (1);
insert into auth.users(id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000001', 'admin@example.org', now()),
 ('00000000-0000-0000-0000-000000000002', 'Student@school.org', now()),
 ('00000000-0000-0000-0000-000000000003', 'other@school.org', now()),
 ('00000000-0000-0000-0000-000000000004', 'student@school.org', null);
\ir '..\\data\\field-entry-setup.sql'
\ir '..\\data\\field-access-setup.sql'
\ir '..\\data\\field-observations-setup.sql'
insert into public.field_access_admins values ('00000000-0000-0000-0000-000000000001');
do $$
begin
 if has_function_privilege('anon', 'public.submit_field_sample(uuid,bigint,date,jsonb,jsonb)', 'execute') then
   raise exception 'anonymous submit remains enabled';
 end if;
 if not has_function_privilege('authenticated', 'public.submit_field_sample(uuid,bigint,date,jsonb,jsonb)', 'execute') then
   raise exception 'authenticated submit not granted';
 end if;
 if has_function_privilege('anon', 'public.submit_field_sample(uuid,bigint,date,jsonb)', 'execute') then
   raise exception 'anonymous compatibility submit remains enabled';
 end if;
 if not has_function_privilege('authenticated', 'public.submit_field_sample(uuid,bigint,date,jsonb)', 'execute') then
   raise exception 'authenticated compatibility submit not granted';
 end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select public.field_access_change(' Student@School.org ', true);
do $$ begin
 if (select count(*) from public.field_access_list()) <> 1 then raise exception 'allowlist missing'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
 if public.field_access_allowed() then raise exception 'unapproved account allowed'; end if;
 begin
   perform public.field_access_change('other@school.org', true);
   raise exception 'non-admin managed allowlist';
 exception when raise_exception then
   if sqlerrm <> 'Not authorized to manage field access' then raise; end if;
 end;
 begin
   perform public.submit_field_sample('10000000-0000-0000-0000-000000000001', 4, '2026-01-01', '{"1":10}', '{"weather":"rain"}');
   raise exception 'unapproved account submitted';
 exception when raise_exception then
   if sqlerrm <> 'Not authorized to submit field samples' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
do $$ begin
 if public.field_access_allowed() then raise exception 'unverified email allowed'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
 if not public.field_access_allowed() then raise exception 'approved account denied'; end if;
 perform public.submit_field_sample('10000000-0000-0000-0000-000000000001', 4, '2026-01-01', '{"1":10}', '{"weather":"rain"}');
 perform public.submit_field_sample('10000000-0000-0000-0000-000000000001', 4, '2026-01-01', '{"1":10}', '{"weather":"rain"}');
 if (select count(*) from public.field_submissions) <> 1 then raise exception 'retry duplicate'; end if;
 if (select observations->>'weather' from public.field_submissions limit 1) <> 'rain' then
   raise exception 'site observations were not retained';
 end if;
 begin
   perform public.submit_field_sample('10000000-0000-0000-0000-000000000001', 4, '2026-01-01', '{"1":10}', '{"weather":"sunny"}');
   raise exception 'changed retry accepted';
 exception when raise_exception then
   if sqlerrm <> 'Submission ID already used for a different sample' then raise; end if;
 end;
 begin
   perform public.submit_field_sample('10000000-0000-0000-0000-000000000002', 4, '2026-01-01', '{"1":10}', '{"unknown":"value"}');
   raise exception 'invalid observation accepted';
 exception when raise_exception then
   if sqlerrm <> 'Invalid site observations' then raise; end if;
 end;
 begin
   perform public.submit_field_sample('10000000-0000-0000-0000-000000000003', 4, '2026-01-01', '{"1":10}', jsonb_build_object('weather', repeat('x', 501)));
   raise exception 'oversized observation accepted';
 exception when raise_exception then
   if sqlerrm <> 'Invalid site observations' then raise; end if;
 end;
 perform public.submit_field_sample('10000000-0000-0000-0000-000000000004', 4, '2026-01-01', '{"1":11}');
 if (select observations <> '{}'::jsonb from public.field_submissions
     where id = '10000000-0000-0000-0000-000000000004') then
   raise exception 'legacy submission did not receive empty observations';
 end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select public.field_access_change('student@school.org', false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
 if public.field_access_allowed() then raise exception 'revoked account allowed'; end if;
end $$;
\echo 'PASS: anonymous, allowed, unapproved, unverified, revocation, admin and retry checks'
