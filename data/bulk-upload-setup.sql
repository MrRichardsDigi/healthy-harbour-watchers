-- Install only after reviewing this script; requires field-entry-setup.sql.
begin;

create table if not exists public.bulk_uploads (
  id uuid primary key,
  sampling_date date not null,
  measurements jsonb not null,
  published_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.bulk_uploads enable row level security;
revoke all on public.bulk_uploads from anon, authenticated;

create or replace function public.bulk_measurement_duplicates(p_date date, p_measurements jsonb)
returns table(locationid bigint, parameterid bigint)
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.field_reviewers where user_id = auth.uid()) then
    raise exception 'Not authorized to upload measurements';
  end if;
  if p_date is null or p_measurements is null or jsonb_typeof(p_measurements) <> 'array' then
    raise exception 'A date and measurements are required';
  end if;
  return query
    select distinct x.locationid, x.parameterid
    from jsonb_to_recordset(p_measurements) as x(locationid bigint, parameterid bigint, value numeric)
    join public.data d on d.locationid = x.locationid and d.parameterid = x.parameterid
    join public.samplingdates sd on sd.id = d.dateid and sd.date = p_date;
end;
$$;

create or replace function public.publish_bulk_measurements(p_id uuid, p_date date, p_measurements jsonb)
returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  date_id public.samplingdates.id%type;
  previous public.bulk_uploads%rowtype;
begin
  if not exists (select 1 from public.field_reviewers where user_id = auth.uid()) then
    raise exception 'Not authorized to upload measurements';
  end if;
  if p_id is null or p_date is null or p_measurements is null or jsonb_typeof(p_measurements) <> 'array' then
    raise exception 'An upload ID, date and measurements are required';
  end if;
  if jsonb_array_length(p_measurements) = 0 or jsonb_array_length(p_measurements) > 5000 then
    raise exception 'An upload must contain between 1 and 5000 measurements';
  end if;
  perform pg_advisory_xact_lock(hashtext('bulk-upload-id'), hashtext(p_id::text));
  select * into previous from public.bulk_uploads where id = p_id;
  if found then
    if previous.sampling_date <> p_date or previous.measurements <> p_measurements or previous.published_by <> auth.uid() then
      raise exception 'Upload ID already used for a different upload';
    end if;
    return;
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_measurements) as x(locationid bigint, parameterid bigint, value numeric)
    where x.locationid is null or x.parameterid is null or x.value is null
      or x.parameterid not between 1 and 10
      or not exists (select 1 from public.locations l where l.id = x.locationid)
      or not exists (select 1 from public.parameters p where p.id = x.parameterid)
  ) then raise exception 'Upload contains an invalid site, parameter, or measurement'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_measurements) as x(locationid bigint, parameterid bigint, value numeric)
    group by x.locationid, x.parameterid having count(*) > 1
  ) then raise exception 'Upload contains duplicate measurements'; end if;

  perform pg_advisory_xact_lock(hashtext('field-sampling-date'), hashtext(p_date::text));
  if exists (select 1 from public.bulk_measurement_duplicates(p_date, p_measurements)) then
    raise exception 'Existing measurements found for this date and site. No data was published';
  end if;
  select id into date_id from public.samplingdates where date = p_date order by id limit 1;
  if date_id is null then
    begin
      insert into public.samplingdates(date) values (p_date) returning id into date_id;
    exception when unique_violation then
      select id into date_id from public.samplingdates where date = p_date order by id limit 1;
      if date_id is null then raise; end if;
    end;
  end if;
  insert into public.data(locationid, dateid, parameterid, value)
    select x.locationid, date_id, x.parameterid, x.value
    from jsonb_to_recordset(p_measurements) as x(locationid bigint, parameterid bigint, value numeric);
  insert into public.bulk_uploads(id, sampling_date, measurements, published_by)
    values (p_id, p_date, p_measurements, auth.uid());
end;
$$;
revoke all on function public.bulk_measurement_duplicates(date, jsonb) from public, anon, authenticated;
revoke all on function public.publish_bulk_measurements(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.bulk_measurement_duplicates(date, jsonb) to authenticated;
grant execute on function public.publish_bulk_measurements(uuid, date, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
