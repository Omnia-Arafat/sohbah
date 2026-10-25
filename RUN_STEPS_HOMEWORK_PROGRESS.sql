create table if not exists public.homework_progress (
  quiz_id          uuid not null references public.quizzes(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  question_id      uuid not null references public.quiz_questions(id) on delete cascade,
  first_checked_at timestamptz not null default now(),
  last_checked_at  timestamptz not null default now(),
  primary key (student_id, question_id)
);

create index if not exists idx_homework_progress_quiz
  on public.homework_progress (quiz_id);

alter table public.homework_progress enable row level security;
revoke all on public.homework_progress from anon, authenticated;

create or replace function public.check_homework_answer(
  p_question_id uuid,
  p_student_id  uuid,
  p_phone       text,
  p_option_ids  uuid[],
  p_text        text
)
returns table (
  is_correct         boolean,
  correct_option_ids uuid[],
  correct_text       text
)
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_student  public.students;
  v_question public.quiz_questions%rowtype;
  v_key      uuid[];
  v_texts    text;
  v_correct  boolean;
begin
  v_student := public.homework_student(p_student_id, p_phone);

  select * into v_question from public.quiz_questions where id = p_question_id;
  if not found or not public.homework_open_to(v_question.quiz_id, v_student) then
    raise exception 'homework_not_found' using errcode = 'P0002';
  end if;

  select array_agg(qo.id order by qo.id),
         string_agg(qo.text, ' / ' order by qo.position)
    into v_key, v_texts
    from public.quiz_options qo
   where qo.question_id = p_question_id and qo.is_correct;

  v_correct :=
    case
      when v_question.kind in ('mcq', 'multi', 'true_false') then
        coalesce(
          v_key = (select array_agg(x order by x)
                     from unnest(coalesce(p_option_ids, '{}'::uuid[])) as x
                    where x in (select qo.id from public.quiz_options qo
                                 where qo.question_id = p_question_id)),
          false)
      when v_question.kind = 'fill_blank' then
        exists (select 1 from public.quiz_options qo
                 where qo.question_id = p_question_id and qo.is_correct
                   and public.normalize_ar(qo.text)
                     = public.normalize_ar(coalesce(p_text, '')))
      else null
    end;

  insert into public.homework_progress as hp (quiz_id, student_id, question_id)
  values (v_question.quiz_id, v_student.id, p_question_id)
  on conflict (student_id, question_id)
  do update set last_checked_at = now();

  return query
  select
    v_correct,
    case when v_question.kind in ('mcq', 'multi', 'true_false')
         then coalesce(v_key, '{}'::uuid[]) end,
    case when v_question.kind in ('mcq', 'multi', 'true_false')
         then null else v_texts end;
end
$$;

create or replace function public.homework_progress_for(p_quiz_id uuid)
returns table (
  student_id      uuid,
  name            text,
  father_name     text,
  checked_count   bigint,
  question_count  bigint,
  last_checked_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_quiz  public.quizzes%rowtype;
  v_total bigint;
begin
  select * into v_quiz from public.quizzes q where q.id = p_quiz_id;
  if not found or not v_quiz.is_homework or not public.is_staff_of(v_quiz.academy_id) then
    raise exception 'homework_not_found' using errcode = 'P0002';
  end if;

  select count(*) into v_total from public.quiz_questions qq where qq.quiz_id = p_quiz_id;

  return query
  with roster as (
    select ar.student_id as sid
      from public.attendance_records ar
      join public.circles c on c.id = ar.circle_id
     where c.academy_id = v_quiz.academy_id
       and c.type = v_quiz.circle_type
       and (v_quiz.circle_id is null or c.id = v_quiz.circle_id)
       and ar.session_date >= current_date - 60
    union
    select hp.student_id from public.homework_progress hp where hp.quiz_id = p_quiz_id
  ),
  progress as (
    select hp.student_id as sid, count(*) as checked, max(hp.last_checked_at) as last_at
      from public.homework_progress hp
     where hp.quiz_id = p_quiz_id
     group by hp.student_id
  )
  select s.id, s.name, s.father_name, coalesce(p.checked, 0), v_total, p.last_at
    from roster r
    join public.students s on s.id = r.sid
    left join progress p on p.sid = r.sid
   where s.academy_id = v_quiz.academy_id
     and public.staff_sees_student(s.id)
   order by coalesce(p.checked, 0) desc, s.name, s.father_name;
end
$$;

revoke execute on function public.homework_progress_for(uuid) from public;
grant  execute on function public.homework_progress_for(uuid) to authenticated;

comment on function public.homework_progress_for(uuid) is
  'Staff only: each expected student and how many of the واجب''s questions she has checked. No marks.';
