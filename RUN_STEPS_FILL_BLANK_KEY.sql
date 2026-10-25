create or replace function public.quiz_for_student(p_attempt_id uuid)
returns table (
  question_id uuid,
  question_position int,
  kind        text,
  prompt      text,
  media_url   text,
  points      numeric,
  option_id   uuid,
  option_text text,
  chosen      boolean,
  text_answer text
)
language sql stable security definer set search_path = public
as $$
  select qq.id, qq.position, qq.kind, qq.prompt, qq.media_url, qq.points,
         qo.id, qo.text,
         coalesce(qo.id = any(qa.option_ids), false),
         qa.text_answer
    from public.quiz_attempts a
    join public.quizzes q        on q.id  = a.quiz_id
    join public.quiz_questions qq on qq.quiz_id = q.id
    left join public.quiz_options qo
      on qo.question_id = qq.id and qq.kind in ('mcq', 'multi', 'true_false')
    left join public.quiz_answers qa
      on qa.attempt_id = a.id and qa.question_id = qq.id
   where a.id = p_attempt_id
   order by
     case when q.shuffle_questions
          then hashtext(a.id::text || qq.id::text) end,
     qq.position,
     qo.position;
$$;
