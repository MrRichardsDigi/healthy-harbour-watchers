-- Run after data/field-access-setup.sql as the project owner.
-- This exposes registered field accounts only to field access administrators.
create or replace function public.field_access_account_list()
returns table(email text, created_at timestamptz, approved boolean, confirmed boolean)
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.field_access_admins where user_id = auth.uid()) then
    raise exception 'Not authorized to manage field access';
  end if;
  return query
    select lower(btrim(u.email)),
      u.created_at,
      exists (
        select 1
        from public.field_allowed_emails a
        where a.email = lower(btrim(u.email))
      ),
      u.email_confirmed_at is not null
    from auth.users u
    where u.email is not null
      and not coalesce(u.is_anonymous, false)
    order by lower(btrim(u.email));
end;
$$;

revoke all on function public.field_access_account_list() from public, anon, authenticated;
grant execute on function public.field_access_account_list() to authenticated;
notify pgrst, 'reload schema';
