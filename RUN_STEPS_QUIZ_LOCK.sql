create or replace function public.save_quiz_answer(
  p_attempt_id uuid, p_question_id uuid,
  p_option_ids uuid[] default null, p_text text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_attempt public.quiz_attempts%rowtype;
  v_quiz    public.quizzes%rowtype;
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id
     for update;
  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;

  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt_already_submitted' using errcode = '42501';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;

  if v_quiz.duration_minutes is not null
     and now() > v_attempt.started_at + make_interval(mins => v_quiz.duration_minutes) then
    raise exception 'time_up' using errcode = '22023';
  end if;

  if v_quiz.closes_at is not null and now() > v_quiz.closes_at then
    raise exception 'quiz_closed' using errcode = '22023';
  end if;

  if not exists (select 1 from public.quiz_questions
                  where id = p_question_id and quiz_id = v_attempt.quiz_id) then
    raise exception 'question_not_in_quiz' using errcode = '42501';
  end if;

  insert into public.quiz_answers (attempt_id, question_id, option_ids, text_answer)
  values (p_attempt_id, p_question_id, p_option_ids, p_text)
  on conflict (attempt_id, question_id) do update
    set option_ids  = excluded.option_ids,
        text_answer = excluded.text_answer,
        answered_at = now();
end
$$;

create or replace function public.submit_quiz_attempt(p_attempt_id uuid)
returns table (
  auto_score    numeric,
  max_score     numeric,
  pending_count bigint,
  pass_score    numeric,
  show_results  text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_attempt public.quiz_attempts%rowtype;
  v_quiz    public.quizzes%rowtype;
  v_auto    numeric := 0;
  v_max     numeric := 0;
  v_pending bigint  := 0;
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id
     for update;
  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;

  if v_attempt.status <> 'in_progress' then
    return query
      select v_attempt.auto_score, v_attempt.max_score,
             (select count(*) from public.quiz_answers qa
               where qa.attempt_id = p_attempt_id and qa.is_correct is null),
             v_quiz.pass_score, v_quiz.show_results;
    return;
  end if;

  update public.quiz_answers qa
     set is_correct = graded.correct,
         awarded_points = case when graded.correct then graded.points else 0 end
    from (
      select qq.id as question_id, qq.points, qq.kind,
             case
               when qq.kind in ('mcq', 'multi', 'true_false') then
                 coalesce(
                   (select array_agg(qo.id order by qo.id)
                      from public.quiz_options qo
                     where qo.question_id = qq.id and qo.is_correct)
                   = (select array_agg(x order by x)
                        from unnest(coalesce(ans.option_ids, '{}'::uuid[])) as x
                       where x in (select id from public.quiz_options
                                    where question_id = qq.id)),
                   false)
               when qq.kind = 'fill_blank' then
                 exists (select 1 from public.quiz_options qo
                          where qo.question_id = qq.id and qo.is_correct
                            and public.normalize_ar(qo.text)
                              = public.normalize_ar(coalesce(ans.text_answer, '')))
               else null
             end as correct
        from public.quiz_questions qq
        join public.quiz_answers ans
          on ans.question_id = qq.id and ans.attempt_id = p_attempt_id
       where qq.quiz_id = v_attempt.quiz_id
    ) as graded
   where qa.attempt_id = p_attempt_id
     and qa.question_id = graded.question_id;

  select coalesce(sum(qa.awarded_points), 0),
         count(*) filter (where qa.is_correct is null)
    into v_auto, v_pending
    from public.quiz_answers qa
   where qa.attempt_id = p_attempt_id;

  select coalesce(sum(qq.points), 0) into v_max
    from public.quiz_questions qq
   where qq.quiz_id = v_attempt.quiz_id;

  update public.quiz_attempts
     set status = case when v_pending > 0 then 'submitted' else 'graded' end,
         submitted_at = now(),
         auto_score = v_auto,
         max_score = v_max
   where id = p_attempt_id;

  return query
    select v_auto, v_max, v_pending, v_quiz.pass_score, v_quiz.show_results;
end
$$;
