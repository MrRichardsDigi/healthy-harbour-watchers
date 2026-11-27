-- Run after data/site-photos-setup.sql on projects with an existing site-photos bucket.
begin;

update storage.buckets
set file_size_limit = 10485760
where id = 'site-photos';

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'site-photos') then
    raise exception 'The site-photos bucket does not exist; run site-photos-setup.sql first';
  end if;
end;
$$;

commit;
