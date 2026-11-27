-- REVIEW AND TEST BEFORE RUNNING. Requires field-entry and field-access setup.
begin;

alter table public.field_submissions
  add column if not exists observations jsonb not null default '{}'::jsonb;

create or replace function public.submit_field_sample(
  p_id uuid, p_locationid bigint, p_date date, p_measurements jsonb, p_observations jsonb
) returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  item record;
  existing public.field_submissions%rowtype;
begin
  if not public.field_access_allowed() then
    raise exception 'Not authorized to submit field samples';
  end if;
  if p_id is null or p_locationid is null or p_date is null or p_measurements is null
     or jsonb_typeof(p_measurements) <> 'object' or p_measurements = '{}'::jsonb then
    raise exception 'A site, date and at least one measurement are required';
  end if;
  if p_observations is null or jsonb_typeof(p_observations) <> 'object' then
    raise exception 'Invalid site observations';
  end if;
  if exists (
    select 1 from jsonb_each(p_observations)
    where key not in ('weather', 'tide', 'surface', 'other')
       or jsonb_typeof(value) <> 'string'
       or length(value #>> '{}') > 500
  ) then
    raise exception 'Invalid site observations';
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
  insert into public.field_submissions (id, locationid, sampling_date, measurements, observations)
    values (p_id, p_locationid, p_date, p_measurements, p_observations)
    on conflict (id) do nothing;
  if not found then
    select * into existing from public.field_submissions where id = p_id;
    if existing.locationid <> p_locationid or existing.sampling_date <> p_date
       or existing.measurements <> p_measurements or existing.observations <> p_observations then
      raise exception 'Submission ID already used for a different sample';
    end if;
  end if;
end;
$$;

create or replace function public.submit_field_sample(
  p_id uuid, p_locationid bigint, p_date date, p_measurements jsonb
) returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  perform public.submit_field_sample(p_id, p_locationid, p_date, p_measurements, '{}'::jsonb);
end;
$$;
revoke all on function public.submit_field_sample(uuid, bigint, date, jsonb) from public, anon, authenticated;
grant execute on function public.submit_field_sample(uuid, bigint, date, jsonb) to authenticated;
revoke all on function public.submit_field_sample(uuid, bigint, date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.submit_field_sample(uuid, bigint, date, jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
