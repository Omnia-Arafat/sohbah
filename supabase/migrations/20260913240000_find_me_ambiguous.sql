-- `find_me` must stop guessing which household member is signing in.
--
-- THE BUG, ON LIVE DATA: eight phone numbers in this academy belong to more
-- than one student — mothers and their children, sisters, one woman recorded
-- twice. That is normal here; a family shares a line.
--
-- The first version returned `limit 1` ordered by name similarity, on the
-- reasoning that a lookup returning several near-matches would be a way to
-- test names against phone numbers. That reasoning was wrong twice over:
--
--   1. It does not protect anything. A caller who holds the number already
--      gets a row back for any name fragment that matches anybody on it — so
--      the "one row" rule leaks exactly as much and simply picks for you.
--
--   2. It picks WRONGLY. ياسين طارق typing "ياسين" with the family number is
--      answered with «ام ياسين» — his mother's row — because her name also
--      contains his. He would then be looking at her حفظ, her تسميع and her
--      mistakes. Verified against production before this was written.
--
-- So the function now returns every match, up to five, and the caller has to
-- ask. What is disclosed is the set of names registered on a number, to
-- someone who already knows that number — which is the household itself, and
-- is the minimum required for her to point at her own name.
--
-- Still refused, as before: fewer than nine digits, a name under two
-- characters, and any match outside the academy in the URL (which is what
-- keeps the two أمنية عرفات rows, one in each academy, apart).

create or replace function public.find_me(
  p_academy_slug text,
  p_name         text,
  p_phone        text
)
returns table (id uuid, name text, father_name text)
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_academy uuid;
  v_given   text;
begin
  select a.id into v_academy
    from public.academies a
   where a.slug = p_academy_slug and a.is_active;
  if not found then
    raise exception 'academy_not_found' using errcode = 'P0002';
  end if;

  v_given := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  if char_length(v_given) < 9 or char_length(btrim(coalesce(p_name, ''))) < 2 then
    return;
  end if;

  return query
    select s.id, s.name, s.father_name
      from public.students s
     where s.academy_id = v_academy
       and s.phone_key is not null
       and (s.phone_key = v_given or right(s.phone_key, 9) = right(v_given, 9))
       and s.search_key like '%' || public.normalize_ar(btrim(p_name)) || '%'
     order by extensions.similarity(
                s.search_key, public.normalize_ar(btrim(p_name))
              ) desc,
              s.name
     -- Five is past every real household on this number and still refuses to
     -- become a directory: a name typed loosely enough to match six students
     -- has not identified anybody, and the caller is told to be specific.
     limit 5;
end
$$;

revoke execute on function public.find_me(text, text, text) from public;
grant  execute on function public.find_me(text, text, text) to anon, authenticated;

comment on function public.find_me(text, text, text) is
  'Students matching a name AND phone within one academy. Returns every match '
  'so the caller can ask which one — it must never choose for her.';
