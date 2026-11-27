begin;

update public.locations
set location = 'Stream at Sawyers Bay'
where id = 11
  and location = 'Stream at Sawyer Bay';

do $$
begin
  if not exists (
    select 1 from public.locations
    where id = 11 and location = 'Stream at Sawyers Bay'
  ) then
    raise exception 'Location id 11 was not found or did not have the expected current name';
  end if;
end;
$$;

commit;
