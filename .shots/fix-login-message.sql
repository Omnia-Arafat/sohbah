create or replace function public.staff_phone_registered(
  p_phone_key    text,
  p_academy_slug text
)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.teachers t
      join public.academies a on a.id = t.academy_id
     where a.slug     = p_academy_slug
       and t.phone_key = p_phone_key
  )
$$;

comment on function public.staff_phone_registered(text, text) is
  'Whether any staff row in that academy carries this phone key. Boolean only — used by the sign-in screen to separate "wrong number" from "wrong password".';

revoke execute on function public.staff_phone_registered(text, text) from public;
grant  execute on function public.staff_phone_registered(text, text) to anon, authenticated;
