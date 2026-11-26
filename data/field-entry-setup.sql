-- Run as the project owner in the Supabase SQL editor.
-- Authorize reviewers separately as described in README.md.
begin;
do $$
begin
  if to_regclass('public.field_allowed_emails') is not null then
    raise exception 'Field access is already installed; do not rerun the public field-entry setup';
  end if;
end;
$$;

create table if not exists public.field_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.field_submissions (
  id uuid primary key,
  locationid bigint not null references public.locations(id),
  sampling_date date not null,
  measurements jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

alter table public.field_reviewers enable row level security;
alter table public.field_submissions enable row level security;
revoke all on public.field_reviewers, public.field_submissions from anon, authenticated;

create or replace function public.submit_field_sample(
  p_id uuid, p_locationid bigint, p_date date, p_measurements jsonb
) returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  item record;
  existing public.field_submissions%rowtype;
begin
  if p_id is null or p_locationid is null or p_date is null or p_measurements is null
     or jsonb_typeof(p_measurements) <> 'object' or p_measurements = '{}'::jsonb then
    raise exception 'A site, date and at least one measurement are required';
  end if;
  if not exists (select 1 from public.locations where id = p_locationid) then
    raise exception 'Unknown sampling site';
  end if;
  for item in select key, value from jsonb_each(p_measurements) loop
    if item.key not in ('1','2','3','4','5','6','7','8','9','10','11')
       or jsonb_typeof(item.value) <> 'number' then
      raise exception 'Invalid measurement';
    end if;
    if not exists (select 1 from public.parameters where id = item.key::integer) then
      raise exception 'Measurement parameter % is not configured', item.key;
    end if;
  end loop;
  insert into public.field_submissions (id, locationid, sampling_date, measurements)
    values (p_id, p_locationid, p_date, p_measurements)
    on conflict (id) do nothing;
  if not found then
    select * into existing from public.field_submissions where id = p_id;
    if existing.locationid <> p_locationid or existing.sampling_date <> p_date
       or existing.measurements <> p_measurements then
      raise exception 'Submission ID already used for a different sample';
    end if;
  end if;
end;
$$;

create or replace function public.pending_field_samples()
returns setof public.field_submissions
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.field_reviewers where user_id = auth.uid()) then
    raise exception 'Not authorized to review field submissions';
  end if;
  return query select * from public.field_submissions
    where status = 'pending' order by created_at;
end;
$$;

create or replace function public.review_field_sample(p_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  sample public.field_submissions%rowtype;
  sample_date_id public.samplingdates.id%type;
begin
  if not exists (select 1 from public.field_reviewers where user_id = auth.uid()) then
    raise exception 'Not authorized to review field submissions';
  end if;
  if p_approve is null then raise exception 'A review decision is required'; end if;
  select * into sample from public.field_submissions where id = p_id for update;
  if not found or sample.status <> 'pending' then
    raise exception 'Submission not found or already reviewed';
  end if;
  if p_approve then
    perform pg_advisory_xact_lock(hashtext('field-sampling-date'), hashtext(sample.sampling_date::text));
    select id into sample_date_id from public.samplingdates where date = sample.sampling_date limit 1;
    if sample_date_id is null then
      begin
        insert into public.samplingdates (date) values (sample.sampling_date) returning id into sample_date_id;
      exception when unique_violation then
        select id into sample_date_id from public.samplingdates where date = sample.sampling_date limit 1;
        if sample_date_id is null then raise; end if;
      end;
    end if;
    insert into public.data (locationid, dateid, parameterid, value)
      select sample.locationid, sample_date_id, key::integer, value::numeric
      from jsonb_each_text(sample.measurements);
  end if;
  update public.field_submissions
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_id;
end;
$$;

revoke all on function public.submit_field_sample(uuid, bigint, date, jsonb) from public, anon, authenticated;
revoke all on function public.pending_field_samples() from public, anon, authenticated;
revoke all on function public.review_field_sample(uuid, boolean) from public, anon, authenticated;
grant execute on function public.submit_field_sample(uuid, bigint, date, jsonb) to anon, authenticated;
grant execute on function public.pending_field_samples() to authenticated;
grant execute on function public.review_field_sample(uuid, boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
