-- REVIEW AND TEST BEFORE RUNNING. Requires field-entry-setup.sql.
-- Applying this transaction disables anonymous field submissions immediately.
-- Bootstrap field_access_admins separately as described in README.md.
begin;

create table if not exists public.field_access_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.field_allowed_emails (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.field_submissions
  add column if not exists observations jsonb not null default '{}'::jsonb;
alter table public.field_access_admins enable row level security;
alter table public.field_allowed_emails enable row level security;
revoke all on public.field_access_admins, public.field_allowed_emails from public, anon, authenticated;

create or replace function public.field_access_allowed()
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from auth.users u
    join public.field_allowed_emails a on a.email = lower(btrim(u.email))
    where u.id = auth.uid() and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous, false)
  );
$$;

create or replace function public.field_access_list()
returns table(email text, created_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.field_access_admins where user_id = auth.uid()) then
    raise exception 'Not authorized to manage field access';
  end if;
  return query select a.email, a.created_at from public.field_allowed_emails a order by a.email;
end;
$$;

create or replace function public.field_access_change(p_email text, p_allow boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare normalized text := lower(btrim(p_email));
begin
  if not exists (select 1 from public.field_access_admins where user_id = auth.uid()) then
    raise exception 'Not authorized to manage field access';
  end if;
  if normalized is null or normalized !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' or p_allow is null then
    raise exception 'A valid email address and action are required';
  end if;
  if p_allow then
    insert into public.field_allowed_emails(email, added_by) values (normalized, auth.uid())
      on conflict (email) do nothing;
  else
    delete from public.field_allowed_emails where email = normalized;
  end if;
end;
$$;

create or replace function public.submit_field_sample(
  p_id uuid, p_locationid bigint, p_date date, p_measurements jsonb, p_observations jsonb
) returns void language plpgsql security definer set search_path = pg_catalog, public
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

revoke all on function public.field_access_allowed() from public, anon, authenticated;
revoke all on function public.field_access_list() from public, anon, authenticated;
revoke all on function public.field_access_change(text, boolean) from public, anon, authenticated;
do $$
begin
  if to_regprocedure('public.submit_field_sample(uuid,bigint,date,jsonb)') is not null then
    execute 'revoke all on function public.submit_field_sample(uuid, bigint, date, jsonb) from public, anon, authenticated';
  end if;
end;
$$;
revoke all on function public.submit_field_sample(uuid, bigint, date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.field_access_allowed() to authenticated;
grant execute on function public.field_access_list() to authenticated;
grant execute on function public.field_access_change(text, boolean) to authenticated;
grant execute on function public.submit_field_sample(uuid, bigint, date, jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
