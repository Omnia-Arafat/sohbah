-- After the quiz: what she got right, what she got wrong, and a way back to it.
--
-- Until now a finished quiz showed one number and was gone. Reopening the link
-- ended at "no attempts left", and nothing in the app showed the result again,
-- so a student who forgot to share her score had nothing to share.
--
-- Additive only: three new functions, no table or existing function touched.
--
--   quiz_attempt_review(attempt)   the marked paper, question by question
--   my_quiz_attempts(student, phone)   her finished attempts, each with its id
--   latest_quiz_attempt(quiz, student, phone)   the way back from the quiz link
--
-- The attempt id is the bearer token, exactly as it is while she sits the
-- quiz: unguessable, handed out only after her phone number matched.

-- -----------------------------------------------------------------------------
-- 1. The marked paper.
--
-- Honours the quiz's own `show_results`: 'never' shows nothing, 'after_close'
-- waits for `closes_at`. The correct option is revealed only once she can no
-- longer use it — every attempt spent, or the quiz closed — so a quiz that
-- allows a second try does not hand her the key for it. Until then she still
-- sees which of her answers were right and which were wrong.
-- -----------------------------------------------------------------------------
create or replace function public.quiz_attempt_review(p_attempt_id uuid)
returns table (
  quiz_title        text,
  student_name      text,
  status            text,
  auto_score        numeric,
  manual_score      numeric,
  max_score         numeric,
  pass_score        numeric,
  submitted_at      timestamptz,
  key_revealed      boolean,
  question_id       uuid,
  question_position int,
  kind              text,
  prompt            text,
  points            numeric,
  answer_correct    boolean,
  awarded_points    numeric,
  text_answer       text,
  option_id         uuid,
  option_text       text,
  chosen            boolean,
  option_correct    boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_attempt public.quiz_attempts%rowtype;
  v_quiz    public.quizzes%rowtype;
  v_closed  boolean;
  v_reveal  boolean;
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id;
  if not found or v_attempt.status = 'in_progress' then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;
  v_closed := v_quiz.closes_at is not null and v_quiz.closes_at < now();

  if v_quiz.show_results = 'never' then
    raise exception 'results_hidden' using errcode = '42501';
  end if;
  if v_quiz.show_results = 'after_close' and not v_closed then
    raise exception 'results_not_yet' using errcode = '42501';
  end if;

  v_reveal := v_closed or (
    select count(*) from public.quiz_attempts a
     where a.quiz_id = v_quiz.id and a.student_id = v_attempt.student_id
  ) >= v_quiz.max_attempts;

  return query
  select v_quiz.title,
         s.name || ' ' || s.father_name,
         v_attempt.status,
         v_attempt.auto_score, v_attempt.manual_score, v_attempt.max_score,
         v_quiz.pass_score, v_attempt.submitted_at,
         v_reveal,
         qq.id, qq.position, qq.kind, qq.prompt, qq.points,
         qa.is_correct, qa.awarded_points, qa.text_answer,
         qo.id,
         -- A fill-in option IS the answer, so its text waits for the key too.
         case when qq.kind = 'fill_blank' and not v_reveal then null else qo.text end,
         coalesce(qo.id = any(qa.option_ids), false),
         case when v_reveal then qo.is_correct end
    from public.quiz_questions qq
    join public.students s on s.id = v_attempt.student_id
    left join public.quiz_options qo on qo.question_id = qq.id
    left join public.quiz_answers qa
      on qa.attempt_id = v_attempt.id and qa.question_id = qq.id
   where qq.quiz_id = v_quiz.id
   order by qq.position, qo.position;
end
$$;

revoke execute on function public.quiz_attempt_review(uuid) from public;
grant  execute on function public.quiz_attempt_review(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Her finished attempts, for نتائجك in الاختبارات.
--
-- `my_quiz_results` without the id could only list them; this one carries the
-- attempt id so each row opens its marked paper. `results_visible` says whether
-- that paper can be opened yet, so the list never links to a refusal.
-- -----------------------------------------------------------------------------
create or replace function public.my_quiz_attempts(
  p_student_id uuid,
  p_phone      text
)
returns table (
  attempt_id      uuid,
  quiz_id         uuid,
  title           text,
  type_name_ar    text,
  type_name_en    text,
  teacher_name    text,
  status          text,
  score           numeric,
  max_score       numeric,
  pass_score      numeric,
  submitted_at    timestamptz,
  results_visible boolean
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
    select a.id, a.quiz_id, q.title, ct.name_ar, ct.name_en,
           coalesce(pt.name, author.name),
           a.status,
           coalesce(a.auto_score, 0) + coalesce(a.manual_score, 0),
           a.max_score, q.pass_score, a.submitted_at,
           q.show_results = 'after_submit'
             or (q.show_results = 'after_close'
                 and q.closes_at is not null and q.closes_at < now())
      from public.quiz_attempts a
      join public.quizzes q on q.id = a.quiz_id
      left join public.circle_types ct
        on ct.academy_id = q.academy_id and ct.slug = q.circle_type
      left join public.circles pc on pc.id = q.circle_id
      left join public.teachers pt on pt.id = pc.teacher_id
      left join public.teachers author on author.id = q.created_by
     where a.student_id = p_student_id
       and a.status in ('submitted', 'graded')
     order by a.submitted_at desc nulls last
     limit 50;
end
$$;

revoke execute on function public.my_quiz_attempts(uuid, text) from public;
grant  execute on function public.my_quiz_attempts(uuid, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. The way back from the quiz link.
--
-- Opening a finished quiz's link again ends at "no attempts left". With her
-- phone already checked, this hands back her latest finished attempt so the
-- page can take her to its result instead of a dead end.
-- -----------------------------------------------------------------------------
create or replace function public.latest_quiz_attempt(
  p_quiz_id    uuid,
  p_student_id uuid,
  p_phone      text
)
returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_given   text;
  v_id      uuid;
begin
  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_given := public.normalize_phone(p_phone);

  if v_given is null or v_student.phone_key is null
     or (v_student.phone_key <> v_given
         and right(v_student.phone_key, 9) <> right(v_given, 9)) then
    raise exception 'phone_mismatch' using errcode = '42501';
  end if;

  select a.id into v_id
    from public.quiz_attempts a
   where a.quiz_id = p_quiz_id
     and a.student_id = p_student_id
     and a.status in ('submitted', 'graded')
   order by a.attempt_no desc
   limit 1;

  return v_id;
end
$$;

revoke execute on function public.latest_quiz_attempt(uuid, uuid, text) from public;
grant  execute on function public.latest_quiz_attempt(uuid, uuid, text) to anon, authenticated;
