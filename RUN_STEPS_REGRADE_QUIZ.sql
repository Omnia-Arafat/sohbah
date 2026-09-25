create or replace function public.regrade_quiz(p_quiz_id uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  if not exists (
    select 1 from public.quizzes q
     where q.id = p_quiz_id and public.is_staff_of(q.academy_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.quiz_answers qa
     set is_correct = graded.correct,
         awarded_points = case when graded.correct then graded.points else 0 end
    from (
      select ans.attempt_id, qq.id as question_id, qq.points,
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
             end as correct
        from public.quiz_questions qq
        join public.quiz_answers ans on ans.question_id = qq.id
        join public.quiz_attempts a
          on a.id = ans.attempt_id and a.status <> 'in_progress'
       where qq.quiz_id = p_quiz_id
         and qq.kind <> 'short_text'
    ) as graded
   where qa.attempt_id = graded.attempt_id
     and qa.question_id = graded.question_id;

  update public.quiz_answers qa
     set awarded_points = least(qa.awarded_points, qq.points)
    from public.quiz_questions qq, public.quiz_attempts a
   where qq.id = qa.question_id and qq.quiz_id = p_quiz_id
     and qq.kind = 'short_text'
     and a.id = qa.attempt_id and a.status <> 'in_progress'
     and qa.awarded_points > qq.points;

  update public.quiz_attempts a
     set auto_score = totals.score,
         max_score = (select coalesce(sum(qq.points), 0)
                        from public.quiz_questions qq
                       where qq.quiz_id = p_quiz_id),
         status = case when totals.pending > 0 then 'submitted' else 'graded' end
    from (
      select a2.id,
             coalesce(sum(qa.awarded_points), 0) as score,
             count(qa.*) filter (where qa.is_correct is null) as pending
        from public.quiz_attempts a2
        left join public.quiz_answers qa on qa.attempt_id = a2.id
       where a2.quiz_id = p_quiz_id and a2.status <> 'in_progress'
       group by a2.id
    ) as totals
   where a.id = totals.id;

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke execute on function public.regrade_quiz(uuid) from public;
revoke execute on function public.regrade_quiz(uuid) from anon;
grant  execute on function public.regrade_quiz(uuid) to authenticated;
