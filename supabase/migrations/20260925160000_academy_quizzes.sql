-- الاختبارات for every student, not only a circle's own.
--
-- `my_quizzes` shows a student only the quizzes of circles she has attended.
-- The academy wants every published quiz in front of every student, labelled
-- with its circle type and its معلمة so a growing list stays readable.
--
-- Additive: a new function beside `my_quizzes`, which is left untouched so the
-- deployed app keeps working until the new build goes out.
--
-- A student still sits a quiz *in a circle* — `start_quiz_attempt` takes a
-- circle slug and checks `quiz_covers_circle` plus academy and gender — so each
-- row names the circle to sit it in:
--   1. the quiz's own circle, when it is pinned to one;
--   2. otherwise a circle of that type she has attended;
--   3. otherwise the oldest active circle of that type in her section.

create or replace function public.academy_quizzes(
  p_student_id uuid,
  p_phone      text
)
returns table (
  quiz_id           uuid,
  title             text,
  instructions      text,
  duration_minutes  int,
  closes_at         timestamptz,
  max_attempts      int,
  question_count    bigint,
  circle_type       text,
  type_name_ar      text,
  type_name_en      text,
  teacher_name      text,
  registration_slug text,
  attempts_used     bigint
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
  select q.id, q.title, q.instructions, q.duration_minutes, q.closes_at,
         q.max_attempts,
         (select count(*) from public.quiz_questions qq where qq.quiz_id = q.id),
         q.circle_type, ct.name_ar, ct.name_en,
         -- The معلمة of a pinned circle; else whoever wrote the quiz.
         coalesce(pt.name, author.name),
         seat.registration_slug,
         (select count(*) from public.quiz_attempts a
           where a.quiz_id = q.id and a.student_id = p_student_id)
    from public.quizzes q
    join public.circle_types ct
      on ct.academy_id = q.academy_id and ct.slug = q.circle_type
    left join public.circles pc on pc.id = q.circle_id
    left join public.teachers pt on pt.id = pc.teacher_id
    left join public.teachers author on author.id = q.created_by
    cross join lateral (
      select c.registration_slug
        from public.circles c
       where c.academy_id = q.academy_id
         and c.type = q.circle_type
         and c.is_active
         and c.gender_category is not distinct from v_student.gender_category
         and (q.circle_id is null or c.id = q.circle_id)
       order by exists (
                  select 1 from public.attendance_records ar
                   where ar.circle_id = c.id and ar.student_id = p_student_id
                ) desc,
                c.created_at
       limit 1
    ) seat
   where q.academy_id = v_student.academy_id
     and q.is_published
     and (q.opens_at  is null or q.opens_at  <= now())
     and (q.closes_at is null or q.closes_at >= now())
   order by q.closes_at nulls last, q.created_at desc;
end
$$;

revoke execute on function public.academy_quizzes(uuid, text) from public;
grant  execute on function public.academy_quizzes(uuid, text) to anon, authenticated;

comment on function public.academy_quizzes(uuid, text) is
  'Every open quiz in the student''s academy, with its circle type and معلمة. Phone is the credential.';
