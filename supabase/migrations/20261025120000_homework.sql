-- الواجبات: practice papers a student solves at her own pace.
--
-- A واجب is written in the same builder as a quiz — same questions, same
-- options, same answer key — so it is a quiz with a flag rather than a table
-- of its own. What differs is how it is sat: no attempt, no clock, no score.
-- She answers one question, checks it, and is shown right or wrong with the
-- correct answer. Nothing is recorded.
--
-- What this touches on existing objects:
--   * `quizzes` gains `is_homework boolean not null default false`. Every
--     existing row is a quiz and stays one.
--   * `circle_quizzes` and `academy_quizzes` are replaced with the same
--     signatures and one extra condition, `not q.is_homework`, so a واجب never
--     appears among the timed quizzes. Until a واجب exists they return exactly
--     what they returned before.
-- Everything else is new.

alter table public.quizzes
  add column if not exists is_homework boolean not null default false;

create or replace function public.circle_quizzes(p_slug text)
returns table (
  id               uuid,
  title            text,
  instructions     text,
  duration_minutes int,
  closes_at        timestamptz,
  question_count   bigint
)
language sql stable security definer set search_path = public
as $$
  select q.id, q.title, q.instructions, q.duration_minutes, q.closes_at,
         (select count(*) from public.quiz_questions qq where qq.quiz_id = q.id)
    from public.circles c
    join public.quizzes q
      on q.academy_id = c.academy_id
     and q.circle_type = c.type
     and (q.circle_id is null or q.circle_id = c.id)
   where c.registration_slug = p_slug
     and c.is_active
     and q.is_published
     and not q.is_homework
     and (q.opens_at  is null or q.opens_at  <= now())
     and (q.closes_at is null or q.closes_at >= now())
   order by q.closes_at nulls last, q.created_at;
$$;

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
     and not q.is_homework
     and (q.opens_at  is null or q.opens_at  <= now())
     and (q.closes_at is null or q.closes_at >= now())
   order by q.closes_at nulls last, q.created_at desc;
end
$$;

-- The phone is her credential, exactly as for academy_quizzes. Returns her
-- row, or raises.
create or replace function public.homework_student(
  p_student_id uuid,
  p_phone      text
)
returns public.students
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

  return v_student;
end
$$;

-- Whether this واجب is hers to open: published, in her academy, and for a
-- circle type her side of the academy has (or for her side's pinned circle).
create or replace function public.homework_open_to(
  p_quiz_id uuid,
  p_student public.students
)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.quizzes q
     where q.id = p_quiz_id
       and q.is_homework
       and q.is_published
       and q.academy_id = p_student.academy_id
       and (q.opens_at is null or q.opens_at <= now())
       and exists (
             select 1 from public.circles c
              where c.academy_id = q.academy_id
                and c.type = q.circle_type
                and c.is_active
                and c.gender_category is not distinct from p_student.gender_category
                and (q.circle_id is null or c.id = q.circle_id)
           )
  );
$$;

create or replace function public.academy_homework(
  p_student_id uuid,
  p_phone      text
)
returns table (
  quiz_id        uuid,
  title          text,
  instructions   text,
  question_count bigint,
  type_name_ar   text,
  type_name_en   text,
  teacher_name   text
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_student public.students;
begin
  v_student := public.homework_student(p_student_id, p_phone);

  return query
  select q.id, q.title, q.instructions,
         (select count(*) from public.quiz_questions qq where qq.quiz_id = q.id),
         ct.name_ar, ct.name_en,
         coalesce(pt.name, author.name)
    from public.quizzes q
    join public.circle_types ct
      on ct.academy_id = q.academy_id and ct.slug = q.circle_type
    left join public.circles pc on pc.id = q.circle_id
    left join public.teachers pt on pt.id = pc.teacher_id
    left join public.teachers author on author.id = q.created_by
   where public.homework_open_to(q.id, v_student)
   order by q.created_at desc;
end
$$;

-- The questions and their options, in order. Like quiz_for_student, it does
-- NOT select `is_correct`: the answer to a question is given only once she
-- has answered it, by check_homework_answer.
create or replace function public.homework_paper(
  p_quiz_id    uuid,
  p_student_id uuid,
  p_phone      text
)
returns table (
  quiz_title        text,
  instructions      text,
  question_id       uuid,
  question_position int,
  kind              text,
  prompt            text,
  media_url         text,
  option_id         uuid,
  option_text       text
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_student public.students;
begin
  v_student := public.homework_student(p_student_id, p_phone);

  if not public.homework_open_to(p_quiz_id, v_student) then
    raise exception 'homework_not_found' using errcode = 'P0002';
  end if;

  return query
  select q.title, q.instructions,
         qq.id, qq.position, qq.kind, qq.prompt, qq.media_url,
         qo.id, qo.text
    from public.quizzes q
    join public.quiz_questions qq on qq.quiz_id = q.id
    -- A fill_blank question keeps its accepted answers as options; they are
    -- the key, not choices, so only the choice kinds bring their options.
    left join public.quiz_options qo
      on qo.question_id = qq.id and qq.kind in ('mcq', 'multi', 'true_false')
   where q.id = p_quiz_id
   order by qq.position, qo.position;
end
$$;

-- One answer, checked. Graded exactly as submit_quiz_attempt grades it; a
-- short_text answer has no automatic mark, so `is_correct` is null and the
-- model answer, if the معلمة wrote one, is returned for her to compare.
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
language plpgsql stable security definer set search_path = public
as $$
declare
  v_student  public.students;
  v_question public.quiz_questions%rowtype;
  v_key      uuid[];
  v_texts    text;
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

  return query
  select
    case
      when v_question.kind in ('mcq', 'multi', 'true_false') then
        coalesce(
          v_key = (select array_agg(x order by x)
                     from unnest(coalesce(p_option_ids, '{}'::uuid[])) as x
                    where x in (select id from public.quiz_options
                                 where question_id = p_question_id)),
          false)
      when v_question.kind = 'fill_blank' then
        exists (select 1 from public.quiz_options qo
                 where qo.question_id = p_question_id and qo.is_correct
                   and public.normalize_ar(qo.text)
                     = public.normalize_ar(coalesce(p_text, '')))
      else null
    end,
    case when v_question.kind in ('mcq', 'multi', 'true_false')
         then coalesce(v_key, '{}'::uuid[]) end,
    case when v_question.kind in ('mcq', 'multi', 'true_false')
         then null else v_texts end;
end
$$;

revoke execute on function public.homework_student(uuid, text)                       from public;
revoke execute on function public.homework_open_to(uuid, public.students)            from public;
revoke execute on function public.academy_homework(uuid, text)                       from public;
revoke execute on function public.homework_paper(uuid, uuid, text)                   from public;
revoke execute on function public.check_homework_answer(uuid, uuid, text, uuid[], text) from public;

grant execute on function public.academy_homework(uuid, text)                       to anon, authenticated;
grant execute on function public.homework_paper(uuid, uuid, text)                   to anon, authenticated;
grant execute on function public.check_homework_answer(uuid, uuid, text, uuid[], text) to anon, authenticated;

comment on function public.academy_homework(uuid, text) is
  'Every published واجب open to the student. Phone is the credential.';
comment on function public.check_homework_answer(uuid, uuid, text, uuid[], text) is
  'Marks one homework answer and returns the correct answer. Records nothing.';
