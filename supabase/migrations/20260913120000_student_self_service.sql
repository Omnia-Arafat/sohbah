-- "صفحتي" — letting a student see her own record.
--
-- THE PROBLEM THIS HAS TO SOLVE FIRST: students have no accounts. They
-- register once and every door after that is a circle link. So there is no
-- session to hang "which student am I?" on, and the record being opened —
-- what she recited, how she was graded, how many mistakes — is the kind that
-- must not open for a stranger who guesses a name.
--
-- The answer is the one the quiz engine already uses (20260912140000): the
-- student's own phone number is the credential. It is required on `students`,
-- it is not published anywhere, and a person who knows both a student's name
-- and her phone is not a stranger.
--
-- Both functions below therefore take the phone and check it the same way
-- `start_quiz_attempt` does — exact match, or the last nine digits, so a
-- number saved as +20 10... and typed as 010... still matches.

-- =============================================================================
-- 1. Finding yourself
--
-- Name alone can list students (`search_students` does, on a circle page, so
-- a student can find her own row to join). Name plus phone identifies one.
-- This returns AT MOST ONE ROW and never a list: a lookup that returned
-- several near-matches would be a way to test names against phone numbers.
-- =============================================================================

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

  -- Nine digits is the shortest a real number narrows to once the country
  -- code is stripped. Below that this stops being a credential.
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
              ) desc
     limit 1;
end
$$;

revoke execute on function public.find_me(text, text, text) from public;
grant  execute on function public.find_me(text, text, text) to anon, authenticated;

-- =============================================================================
-- 2. Her record
--
-- Returns the raw logs rather than a computed summary, deliberately.
--
-- Turning ranges into "seven أجزاء" needs the جزء and page boundaries, and
-- those live in one generated file on the client (src/lib/quran/structure.ts,
-- built from a published edition). Copying 30 juz and 604 page boundaries into
-- SQL as well would create a second copy to keep in step, and the day they
-- disagreed nothing would say so. One table, one place.
--
-- The volume is small: a student reciting daily for two years has a few
-- hundred rows of six small columns.
-- =============================================================================

create or replace function public.my_recitations(
  p_student_id uuid,
  p_phone      text
)
returns table (
  session_date date,
  kind         text,
  from_surah   smallint,
  from_ayah    smallint,
  to_surah     smallint,
  to_ayah      smallint,
  rating       text,
  major_errors smallint,
  minor_errors smallint,
  circle_name  text,
  teacher_name text
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_given   text;
begin
  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_given := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  if v_student.phone_key is null
     or char_length(v_given) < 9
     or (v_student.phone_key <> v_given
         and right(v_student.phone_key, 9) <> right(v_given, 9)) then
    raise exception 'phone_mismatch' using errcode = '42501';
  end if;

  return query
    select rl.session_date, rl.kind,
           rl.from_surah, rl.from_ayah, rl.to_surah, rl.to_ayah,
           rl.rating, rl.major_errors, rl.minor_errors,
           c.name, t.name
      from public.recitation_logs rl
      join public.circles c on c.id = rl.circle_id
      left join public.teachers t on t.id = rl.teacher_id
     where rl.student_id = p_student_id
     order by rl.session_date desc, rl.created_at desc;
end
$$;

revoke execute on function public.my_recitations(uuid, text) from public;
grant  execute on function public.my_recitations(uuid, text) to anon, authenticated;

-- The note the page shows under her name: which circles she belongs to. Same
-- credential, and nothing here that is not already on a circle's public page.
create or replace function public.my_circles(
  p_student_id uuid,
  p_phone      text
)
returns table (
  circle_id         uuid,
  circle_name       text,
  circle_type       text,
  registration_slug text,
  teacher_name      text,
  last_attended     date
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_given   text;
begin
  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_given := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  if v_student.phone_key is null
     or char_length(v_given) < 9
     or (v_student.phone_key <> v_given
         and right(v_student.phone_key, 9) <> right(v_given, 9)) then
    raise exception 'phone_mismatch' using errcode = '42501';
  end if;

  return query
    select c.id, c.name, c.type, c.registration_slug, t.name,
           max(ar.session_date)
      from public.attendance_records ar
      join public.circles c  on c.id = ar.circle_id and c.is_active
      join public.teachers t on t.id = c.teacher_id
     where ar.student_id = p_student_id
     group by c.id, c.name, c.type, c.registration_slug, t.name
     order by max(ar.session_date) desc;
end
$$;

revoke execute on function public.my_circles(uuid, text) from public;
grant  execute on function public.my_circles(uuid, text) to anon, authenticated;

comment on function public.find_me(text, text, text) is
  'Identifies one student by name AND phone. At most one row, never a list.';
comment on function public.my_recitations(uuid, text) is
  'A student''s own recitation log. Her phone number is the credential.';
