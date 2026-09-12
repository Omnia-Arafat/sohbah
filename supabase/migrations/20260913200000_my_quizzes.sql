-- A student's quizzes, gathered from every circle she is in.
--
-- `circle_quizzes` answers "what is open in THIS circle", which is the right
-- question on a circle's own page. It is the wrong question for the الاختبارات
-- tab in the bottom bar: a student in three circles would have to open three
-- links to find out whether her معلمة set anything, and she has no list of her
-- circles to open in the first place.
--
-- Two functions, both gated on her phone the same way `my_recitations` is —
-- this is her record, and the same credential rule applies.

create or replace function public.my_quizzes(
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
  circle_id         uuid,
  circle_name       text,
  registration_slug text,
  teacher_name      text,
  -- Her own standing on it. `attempts_used` against `max_attempts` is what
  -- decides whether the card offers a button or explains why it does not.
  attempts_used     bigint,
  last_status       text,
  last_score        numeric,
  last_max_score    numeric,
  last_submitted_at timestamptz
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
  with her_circles as (
    -- Every circle she has ever attended. Not "is enrolled in": there is no
    -- enrolment in this app — attendance IS membership.
    select distinct c.id, c.name, c.type, c.academy_id, c.registration_slug,
           c.teacher_id
      from public.attendance_records ar
      join public.circles c on c.id = ar.circle_id and c.is_active
     where ar.student_id = p_student_id
  ),
  -- Scoped exactly like `circle_quizzes`: same academy, same circle type, and
  -- either academy-wide for that type or pinned to this one circle.
  open_quizzes as (
    select distinct on (q.id, hc.id)
           q.*, hc.id as hc_id, hc.name as hc_name,
           hc.registration_slug as hc_slug, hc.teacher_id as hc_teacher
      from her_circles hc
      join public.quizzes q
        on q.academy_id = hc.academy_id
       and q.circle_type = hc.type
       and (q.circle_id is null or q.circle_id = hc.id)
     where q.is_published
       and (q.opens_at  is null or q.opens_at  <= now())
       and (q.closes_at is null or q.closes_at >= now())
  )
  select oq.id, oq.title, oq.instructions, oq.duration_minutes, oq.closes_at,
         oq.max_attempts,
         (select count(*) from public.quiz_questions qq where qq.quiz_id = oq.id),
         oq.hc_id, oq.hc_name, oq.hc_slug, t.name,
         (select count(*) from public.quiz_attempts a
           where a.quiz_id = oq.id and a.student_id = p_student_id),
         (select a.status from public.quiz_attempts a
           where a.quiz_id = oq.id and a.student_id = p_student_id
           order by a.attempt_no desc limit 1),
         (select coalesce(a.auto_score, 0) + coalesce(a.manual_score, 0)
            from public.quiz_attempts a
           where a.quiz_id = oq.id and a.student_id = p_student_id
             and a.status = 'graded'
           order by a.attempt_no desc limit 1),
         (select a.max_score from public.quiz_attempts a
           where a.quiz_id = oq.id and a.student_id = p_student_id
             and a.status = 'graded'
           order by a.attempt_no desc limit 1),
         (select a.submitted_at from public.quiz_attempts a
           where a.quiz_id = oq.id and a.student_id = p_student_id
           order by a.attempt_no desc limit 1)
    from open_quizzes oq
    join public.teachers t on t.id = oq.hc_teacher
   order by oq.closes_at nulls last, oq.created_at;
end
$$;

revoke execute on function public.my_quizzes(uuid, text) from public;
grant  execute on function public.my_quizzes(uuid, text) to anon, authenticated;

-- Her finished attempts, whatever the quiz's current state. Separate from the
-- list above because a closed quiz drops out of "what can I sit" but must stay
-- in "what did I score" — losing her own results when a معلمة closes a quiz
-- would be the app forgetting something on her behalf.
create or replace function public.my_quiz_results(
  p_student_id uuid,
  p_phone      text
)
returns table (
  quiz_id       uuid,
  title         text,
  circle_name   text,
  status        text,
  score         numeric,
  max_score     numeric,
  submitted_at  timestamptz
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
    select a.quiz_id, q.title, c.name, a.status,
           coalesce(a.auto_score, 0) + coalesce(a.manual_score, 0),
           a.max_score, a.submitted_at
      from public.quiz_attempts a
      join public.quizzes q on q.id = a.quiz_id
      left join public.circles c on c.id = a.circle_id
     where a.student_id = p_student_id
       and a.status in ('submitted', 'graded')
     order by a.submitted_at desc nulls last
     limit 30;
end
$$;

revoke execute on function public.my_quiz_results(uuid, text) from public;
grant  execute on function public.my_quiz_results(uuid, text) to anon, authenticated;

comment on function public.my_quizzes(uuid, text) is
  'Open quizzes across every circle a student attends. Phone is the credential.';
