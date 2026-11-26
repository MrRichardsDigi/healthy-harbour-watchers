-- Run after data/field-access-setup.sql and the existing blog table setup.
-- Approved field users may submit unpublished posts; admins publish them separately.
create or replace function public.submit_blog_post(p_title text, p_content text)
returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  title_text text := btrim(p_title);
  content_text text := btrim(p_content);
begin
  if not public.field_access_allowed() then
    raise exception 'Not authorized to submit blog posts';
  end if;
  if title_text is null or title_text = '' or content_text is null or content_text = '' then
    raise exception 'A title and some content are required';
  end if;
  if length(title_text) > 160 or length(content_text) > 12000 then
    raise exception 'The title or content is too long';
  end if;
  insert into public.blog_posts(title, content, image_url, published)
    values (title_text, content_text, '', false);
end;
$$;

revoke all on function public.submit_blog_post(text, text) from public, anon, authenticated;
grant execute on function public.submit_blog_post(text, text) to authenticated;
notify pgrst, 'reload schema';
