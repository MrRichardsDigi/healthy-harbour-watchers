\set ON_ERROR_STOP on
-- Run only against the disposable database prepared by field-access.sql.
create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (bucket_id text, name text, primary key(bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, delete on storage.objects to anon, authenticated;
\ir '..\\data\\site-photos-setup.sql'
-- Exercise the upgrade path for an already-installed 5 MiB bucket.
update storage.buckets set file_size_limit = 5242880 where id = 'site-photos';
\ir '..\\data\\site-photos-10mb-migration.sql'
do $$ begin
 if not exists (select 1 from storage.buckets where id = 'site-photos' and file_size_limit = 10485760) then
   raise exception 'Photo bucket limit was not raised to 10 MiB';
 end if;
end $$;
insert into public.field_reviewers values ('00000000-0000-0000-0000-000000000001');
insert into public.field_allowed_emails(email, added_by) values
 ('student@school.org', '00000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
select public.site_photo_reserve('20000000-0000-0000-0000-000000000001', 4);
insert into storage.objects values ('site-photos', '00000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000001.jpg');
select public.site_photo_submit('20000000-0000-0000-0000-000000000001');
select public.site_photo_submit('20000000-0000-0000-0000-000000000001');
do $$ begin
 if exists (select 1 from public.site_photo_list(4)) then raise exception 'Pending photo is public'; end if;
 begin
   perform public.site_photo_review_list();
   raise exception 'Non-reviewer can list pending photos';
 exception when raise_exception then
   if sqlerrm <> 'Not authorized to review photos' then raise; end if;
 end;
end $$;
reset role;
set role anon;
do $$ begin
 if exists (select 1 from storage.objects) then raise exception 'Anonymous can read pending photo'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
select public.site_photo_review('20000000-0000-0000-0000-000000000001', true);
reset role;
set role anon;
do $$ begin
 if (select count(*) from public.site_photo_list(4)) <> 1 then raise exception 'Approved photo missing'; end if;
 if (select count(*) from storage.objects) <> 1 then raise exception 'Approved photo unavailable'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
select public.site_photo_review('20000000-0000-0000-0000-000000000001', false);
delete from storage.objects where name = '00000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000001.jpg';
select public.site_photo_discard('20000000-0000-0000-0000-000000000001');
reset role;
set role anon;
do $$ begin
 if exists (select 1 from public.site_photo_list(4)) then raise exception 'Removed photo still public'; end if;
 if exists (select 1 from storage.objects) then raise exception 'Removed photo still stored'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$ begin
 begin
   perform public.site_photo_reserve('20000000-0000-0000-0000-000000000002', 4);
   raise exception 'Unapproved user reserved photo';
 exception when raise_exception then
   if sqlerrm <> 'Not authorized to upload site photos' then raise; end if;
 end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ begin
 for i in 1..100 loop
   perform public.site_photo_reserve(md5(i::text)::uuid, 4);
 end loop;
 begin
   perform public.site_photo_reserve(md5('101')::uuid, 4);
   raise exception 'Photo capacity exceeded';
 exception when raise_exception then
   if sqlerrm <> 'Photo storage limit reached; contact the administrator' then raise; end if;
 end;
end $$;
reset role;
\echo 'PASS: photo reservation, upload, review and privacy policies'
