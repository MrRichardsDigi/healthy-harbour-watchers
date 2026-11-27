-- Requires field-entry-setup.sql and field-access-setup.sql.
-- Run only after testing on a separate project. Does not modify measurement data.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-photos', 'site-photos', false, 10485760, array['image/jpeg']);

create table if not exists public.site_photos (
  id uuid primary key,
  locationid bigint not null references public.locations(id),
  submitted_by uuid not null references auth.users(id),
  object_path text not null unique,
  status text not null default 'uploading' check (status in ('uploading', 'pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
alter table public.site_photos enable row level security;
revoke all on public.site_photos from public, anon, authenticated;

create or replace function public.site_photo_reserve(p_id uuid, p_locationid bigint)
returns text language plpgsql security definer set search_path = pg_catalog, public, storage
as $$
declare photo public.site_photos%rowtype;
begin
  if not public.field_access_allowed() then raise exception 'Not authorized to upload site photos'; end if;
  if p_id is null or not exists (select 1 from public.locations where id = p_locationid) then
    raise exception 'A valid photo ID and site are required';
  end if;
  perform pg_advisory_xact_lock(hashtext('site-photo-capacity'));
  select * into photo from public.site_photos where id = p_id;
  if found then
    if photo.submitted_by <> auth.uid() or photo.locationid <> p_locationid or photo.status <> 'uploading' then
      raise exception 'Photo ID already in use';
    end if;
    return photo.object_path;
  end if;
  if (select count(*) from public.site_photos) >= 100 then
    raise exception 'Photo storage limit reached; contact the administrator';
  end if;
  insert into public.site_photos(id, locationid, submitted_by, object_path)
    values (p_id, p_locationid, auth.uid(), auth.uid()::text || '/' || p_id::text || '.jpg')
    returning * into photo;
  return photo.object_path;
end;
$$;

create or replace function public.site_photo_submit(p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, storage
as $$
declare photo public.site_photos%rowtype;
begin
  if not public.field_access_allowed() then raise exception 'Not authorized to upload site photos'; end if;
  select * into photo from public.site_photos where id = p_id and submitted_by = auth.uid() for update;
  if not found or photo.status not in ('uploading', 'pending') then raise exception 'Photo submission not found'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'site-photos' and name = photo.object_path) then
    raise exception 'Photo upload not found';
  end if;
  update public.site_photos set status = 'pending' where id = p_id and status = 'uploading';
end;
$$;

create or replace function public.site_photo_list(p_locationid bigint)
returns table(id uuid, object_path text, created_at timestamptz)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select p.id, p.object_path, p.created_at from public.site_photos p
  where p.locationid = p_locationid and p.status = 'approved'
  order by p.created_at desc;
$$;

create or replace function public.site_photo_review_list()
returns table(id uuid, locationid bigint, object_path text, created_at timestamptz, status text)
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.field_reviewers where user_id = auth.uid()) then
    raise exception 'Not authorized to review photos';
  end if;
  return query select p.id, p.locationid, p.object_path, p.created_at, p.status
    from public.site_photos p
    where p.status in ('pending', 'approved', 'rejected') or (p.status = 'uploading' and p.created_at < now() - interval '1 day')
    order by p.created_at;
end;
$$;

create or replace function public.site_photo_review(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.field_reviewers where user_id = auth.uid()) then
    raise exception 'Not authorized to review photos';
  end if;
  if p_approve is null then raise exception 'A review decision is required'; end if;
  update public.site_photos set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_id and (status = 'pending' or (status = 'approved' and not p_approve));
  if not found then raise exception 'Photo not found or already reviewed'; end if;
end;
$$;

create or replace function public.site_photo_discard(p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, storage
as $$
declare photo public.site_photos%rowtype;
begin
  select * into photo from public.site_photos where id = p_id for update;
  if not found or not (
    (photo.status = 'uploading' and photo.submitted_by = auth.uid() and public.field_access_allowed())
    or (photo.status = 'rejected' and exists (select 1 from public.field_reviewers where user_id = auth.uid()))
    or (photo.status = 'uploading' and photo.created_at < now() - interval '1 day'
      and exists (select 1 from public.field_reviewers where user_id = auth.uid()))
  ) then raise exception 'Not authorized to discard photo'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'site-photos' and name = photo.object_path) then
    raise exception 'Remove the stored photo before discarding its record';
  end if;
  delete from public.site_photos where id = p_id;
end;
$$;

create or replace function public.site_photo_storage_allowed(p_path text, p_upload boolean)
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.site_photos p
    where p.object_path = p_path and (
      (p_upload and p.status = 'uploading' and p.submitted_by = auth.uid() and public.field_access_allowed())
      or (not p_upload and (p.status = 'approved' or
        (p.status = 'uploading' and p.submitted_by = auth.uid() and public.field_access_allowed())
        or exists (select 1 from public.field_reviewers r where r.user_id = auth.uid())))
    )
  );
$$;

create or replace function public.site_photo_discard_allowed(p_path text)
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$
  select exists (select 1 from public.site_photos p where p.object_path = p_path and (
    (p.status = 'uploading' and p.submitted_by = auth.uid() and public.field_access_allowed())
    or (p.status = 'rejected' and exists (select 1 from public.field_reviewers r where r.user_id = auth.uid()))
    or (p.status = 'uploading' and p.created_at < now() - interval '1 day'
      and exists (select 1 from public.field_reviewers r where r.user_id = auth.uid()))
  ));
$$;

create policy "Site photos can be uploaded by approved participants"
on storage.objects for insert to authenticated
with check (bucket_id = 'site-photos' and public.site_photo_storage_allowed(name, true));
create policy "Approved site photos can be viewed"
on storage.objects for select to anon, authenticated
using (bucket_id = 'site-photos' and public.site_photo_storage_allowed(name, false));
create policy "Participants and reviewers can remove private site photos"
on storage.objects for delete to authenticated
using (bucket_id = 'site-photos' and public.site_photo_discard_allowed(name));

revoke all on function public.site_photo_reserve(uuid, bigint) from public, anon, authenticated;
revoke all on function public.site_photo_submit(uuid) from public, anon, authenticated;
revoke all on function public.site_photo_list(bigint) from public, anon, authenticated;
revoke all on function public.site_photo_review_list() from public, anon, authenticated;
revoke all on function public.site_photo_review(uuid, boolean) from public, anon, authenticated;
revoke all on function public.site_photo_discard(uuid) from public, anon, authenticated;
revoke all on function public.site_photo_storage_allowed(text, boolean) from public, anon, authenticated;
revoke all on function public.site_photo_discard_allowed(text) from public, anon, authenticated;
grant execute on function public.site_photo_reserve(uuid, bigint), public.site_photo_submit(uuid) to authenticated;
grant execute on function public.site_photo_list(bigint) to anon, authenticated;
grant execute on function public.site_photo_review_list(), public.site_photo_review(uuid, boolean) to authenticated;
grant execute on function public.site_photo_storage_allowed(text, boolean) to anon, authenticated;
grant execute on function public.site_photo_discard(uuid) to authenticated;
grant execute on function public.site_photo_discard_allowed(text) to authenticated;
notify pgrst, 'reload schema';
commit;
