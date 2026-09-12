-- Marking a written answer by hand, and keeping the attempt's totals honest.
--
-- `submit_quiz_attempt()` grades every kind it can and leaves `short_text`
-- answers with `is_correct = null`, which is what holds the attempt at
-- 'submitted' instead of 'graded'. Until now nothing could move it on.
--
-- Why this is a function rather than a direct UPDATE through RLS: marking one
-- answer changes three things that must agree — the answer's own verdict, the
-- attempt's score, and whether the attempt is finished. Doing that from the
-- app would be three round trips with two windows where a reader sees a score
-- that does not match the answers behind it.
--
-- Authorization is checked inside, against the same rule the table policies
-- use, because SECURITY DEFINER means RLS will not check it for us.

create or replace function public.grade_written_answer(
  p_attempt_id  uuid,
  p_question_id uuid,
  p_is_correct  boolean,
  -- Null means "all of the question's points when correct, none when not",
  -- which is the common case. A number allows partial credit on an essay.
  p_points      numeric default null
)
returns table (auto_score numeric, max_score numeric, pending_count bigint)
language plpgsql security definer set search_path = public
as $$
declare
  v_attempt public.quiz_attempts%rowtype;
  v_points  numeric;
  v_auto    numeric;
  v_max     numeric;
  v_pending bigint;
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id;
  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;

  -- Same test as `attempts_update_staff`: a member of staff of the academy
  -- that owns the quiz. Written out here because SECURITY DEFINER bypasses
  -- the policy that would otherwise enforce it.
  if not exists (
    select 1 from public.quizzes q
     where q.id = v_attempt.quiz_id
       and public.is_staff_of(q.academy_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select qq.points into v_points
    from public.quiz_questions qq
   where qq.id = p_question_id and qq.quiz_id = v_attempt.quiz_id;

  if v_points is null then
    raise exception 'question_not_in_quiz' using errcode = '42501';
  end if;

  -- Partial credit is clamped rather than rejected: a معلمة typing 5 into a
  -- 3-point question meant "full marks", not "break the totals".
  if p_points is not null then
    v_points := least(greatest(p_points, 0), v_points);
  elsif not p_is_correct then
    v_points := 0;
  end if;

  update public.quiz_answers
     set is_correct = p_is_correct,
         awarded_points = case when p_is_correct then v_points else 0 end
   where attempt_id = p_attempt_id
     and question_id = p_question_id;

  select coalesce(sum(qa.awarded_points), 0),
         count(*) filter (where qa.is_correct is null)
    into v_auto, v_pending
    from public.quiz_answers qa
   where qa.attempt_id = p_attempt_id;

  select coalesce(sum(qq.points), 0) into v_max
    from public.quiz_questions qq
   where qq.quiz_id = v_attempt.quiz_id;

  update public.quiz_attempts
     set auto_score = v_auto,
         max_score  = v_max,
         -- Back to 'submitted' if a later edit reopens a question, so the
         -- status always reflects the answers rather than the last click.
         status = case when v_pending > 0 then 'submitted' else 'graded' end
   where id = p_attempt_id;

  return query select v_auto, v_max, v_pending;
end
$$;

revoke execute on function public.grade_written_answer(uuid, uuid, boolean, numeric) from public;
-- Explicitly from anon too: `revoke ... from public` does not undo the grant
-- Supabase's default privileges make to `anon` by name. Marking is staff-only.
revoke execute on function public.grade_written_answer(uuid, uuid, boolean, numeric) from anon;
grant  execute on function public.grade_written_answer(uuid, uuid, boolean, numeric) to authenticated;
