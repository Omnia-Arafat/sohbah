-- تحديات الأذكار open to strangers.
--
-- REPLACES ONE FUNCTION, dhikr_challenges_list (from 20260928120000), with the
-- same body plus one branch. No table, column, policy or row changes.
--
-- The challenges pages no longer need signing in (src/proxy.ts): anyone with
-- the link counts on her phone, and signing in is what sends the count to the
-- server. A reader who is neither a signed-in معلمة nor a known student now
-- sees the challenges meant for EVERYONE — never a حلقة's, which are for its
-- own students — of both sides, since she belongs to neither yet. What that
-- shows is a ذكر, its hadith and a count of her own: no names, no circles.
-- Once she signs in she sees her own side only, as before.
--
-- Rollback: re-run section 1 of 20260928120000 (with its side changes).

create or replace function public.dhikr_challenges_list(
  p_academy_slug text,
  p_student_id   uuid default null,
  p_phone        text default null
)
returns table (
  id          uuid,
  slug        text,
  preset      text,
  title       text,
  dhikr       text,
  virtue      text,
  source      text,
  family      text,
  goal        integer,
  period      text,
  circle_name text,
  created_at  timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_academy uuid;
  v_student public.students%rowtype;
  v_teacher public.teachers%rowtype;
begin
  select a.id into v_academy from public.academies a where a.slug = p_academy_slug and a.is_active;
  if not found then
    raise exception 'academy_not_found' using errcode = 'P0002';
  end if;

  v_student := public.dhikr_verified_student(p_student_id, p_phone);
  v_teacher := public.dhikr_current_teacher();

  return query
    select c.id, c.slug, c.preset, c.title, c.dhikr, c.virtue, c.source,
           c.family, c.goal, c.period, ci.name, c.created_at
      from public.dhikr_challenges c
      left join public.circles ci on ci.id = c.circle_id
     where c.academy_id = v_academy
       and c.is_active
       and (
         -- Staff: their own side (an admin both), every حلقة.
         (v_teacher.id is not null and v_teacher.academy_id = v_academy
            and public.staff_sees_gender(v_academy, c.gender_category))
         -- A student: her own side, and a حلقة challenge only if it is hers.
         or (v_student.id is not null and v_student.academy_id = v_academy
             and v_student.gender_category = c.gender_category
             and (c.circle_id is null or exists (
                   select 1 from public.attendance_records ar
                    where ar.student_id = v_student.id and ar.circle_id = c.circle_id)))
         -- Nobody known yet: the challenges for everyone, never a حلقة's.
         or (v_teacher.id is null and v_student.id is null and c.circle_id is null)
       )
     order by c.created_at desc;
end
$$;

revoke execute on function public.dhikr_challenges_list(text, uuid, text) from public;
grant  execute on function public.dhikr_challenges_list(text, uuid, text) to anon, authenticated;
