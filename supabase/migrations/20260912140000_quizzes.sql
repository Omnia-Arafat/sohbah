-- The quiz engine.
--
-- Like the curriculum layer before it, this is keyed by circle *type*, not by
-- "hadith": a quiz names the type it belongs to, and optionally narrows to one
-- curriculum and one circle. Picking `tajweed` in that first field is all it
-- takes for the same screens to serve حلقة التجويد.
--
-- Who may create one: any approved member of staff of the academy — معلمة or
-- مشرفة alike. The معلمة who taught the أحاديث is the one who knows what to
-- ask about them.
--
-- =============================================================================
-- THE HARD PART: a student has no account.
--
-- Students are anonymous. They hold exactly one credential — the circle's
-- `registration_slug` — which is why every student-facing read in this schema
-- goes through a SECURITY DEFINER function instead of a table policy. A quiz
-- makes that awkward in two specific ways, and both are handled below rather
-- than left to the app:
--
--   1. IDENTITY. "Pick your name from a list" is not an identity check: anyone
--      with the link could answer as anyone. So `start_quiz_attempt()` requires
--      the student's phone number as well, and checks it against the number on
--      her own record. Phone is a required field on `students` as of
--      20260830140000, which is what makes this possible at all.
--
--   2. THE ANSWER KEY. `quiz_options.is_correct` is the answer key. It must
--      never reach a browser. There is therefore NO anon policy on any table
--      here — not even SELECT — and `quiz_for_student()` is the only way a
--      student sees a question. It omits that column by construction rather
--      than by remembering to exclude it.
-- =============================================================================

-- =============================================================================
-- 1. Tables
-- =============================================================================

create table public.quizzes (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id) on delete cascade,
  -- Scope, widest to narrowest. The type is required; the other two narrow it.
  -- A null `circle_id` means "every circle of this type" — which is how one
  -- quiz covers all five حلقات حديث without being written five times.
  circle_type       text not null,
  curriculum_id     uuid references public.curricula(id) on delete set null,
  circle_id         uuid references public.circles(id) on delete cascade,
  title             text not null check (btrim(title) <> ''),
  instructions      text,
  -- Both optional and each open-ended alone: a quiz with neither is simply
  -- always open while it is published.
  opens_at          timestamptz,
  closes_at         timestamptz,
  duration_minutes  int check (duration_minutes between 1 and 480),
  pass_score        numeric(5,2) not null default 50,
  max_attempts      int not null default 1 check (max_attempts between 1 and 10),
  shuffle_questions boolean not null default true,
  show_results      text not null default 'after_submit'
                      check (show_results in ('never', 'after_submit', 'after_close')),
  is_published      boolean not null default false,
  created_by        uuid references public.teachers(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint fk_quizzes_type
    foreign key (academy_id, circle_type)
    references public.circle_types (academy_id, slug),
  constraint ck_quizzes_window
    check (opens_at is null or closes_at is null or closes_at > opens_at)
);

create index idx_quizzes_academy on public.quizzes (academy_id, circle_type)
  where is_published;
create index idx_quizzes_circle on public.quizzes (circle_id)
  where circle_id is not null;

create table public.quiz_questions (
  id        uuid primary key default gen_random_uuid(),
  quiz_id   uuid not null references public.quizzes(id) on delete cascade,
  -- Which حديث this question is about. `set null` rather than cascade: deleting
  -- a unit should not silently delete the questions already asked about it.
  unit_id   uuid references public.curriculum_units(id) on delete set null,
  position  int  not null check (position > 0),
  kind      text not null
              check (kind in ('mcq', 'multi', 'true_false', 'short_text', 'fill_blank')),
  prompt    text not null check (btrim(prompt) <> ''),
  media_url text,
  points    numeric(5,2) not null default 1 check (points > 0),
  constraint uq_question_position
    unique (quiz_id, position) deferrable initially deferred
);

create index idx_questions_quiz on public.quiz_questions (quiz_id, position);

create table public.quiz_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  position    int  not null,
  text        text not null check (btrim(text) <> ''),
  -- THE ANSWER KEY. See the header: no anon policy exists on this table.
  is_correct  boolean not null default false
);

create index idx_options_question on public.quiz_options (question_id, position);

create table public.quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references public.quizzes(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  -- Which circle she sat it in. Null only if that circle is later deleted.
  circle_id    uuid references public.circles(id) on delete set null,
  attempt_no   int  not null default 1 check (attempt_no > 0),
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  auto_score   numeric(6,2),
  manual_score numeric(6,2),
  max_score    numeric(6,2),
  status       text not null default 'in_progress'
                 check (status in ('in_progress', 'submitted', 'graded')),
  constraint uq_attempt unique (quiz_id, student_id, attempt_no)
);

create index idx_attempts_quiz on public.quiz_attempts (quiz_id, status);

create table public.quiz_answers (
  attempt_id     uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id    uuid not null references public.quiz_questions(id) on delete cascade,
  option_ids     uuid[],
  text_answer    text,
  -- Null means "not graded yet" — which is the resting state for a short_text
  -- answer until a معلمة marks it.
  is_correct     boolean,
  awarded_points numeric(5,2),
  answered_at    timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

-- =============================================================================
-- 2. RLS — staff only, everywhere. Students come in through the functions.
-- =============================================================================

alter table public.quizzes        enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_options   enable row level security;
alter table public.quiz_attempts  enable row level security;
alter table public.quiz_answers   enable row level security;

-- --- quizzes ----------------------------------------------------------------
create policy quizzes_select_staff on public.quizzes
  for select to authenticated
  using (public.is_staff_of(academy_id));

create policy quizzes_insert_staff on public.quizzes
  for insert to authenticated
  with check (public.is_staff_of(academy_id));

-- A معلمة edits the quizzes she wrote, or any quiz scoped to a circle of her
-- own; a مشرفة edits any of her academy's. Without the first clause a معلمة
-- could not fix a typo in her own quiz.
create policy quizzes_update_owner on public.quizzes
  for update to authenticated
  using (
    public.can_supervise(academy_id)
    or created_by = public.current_teacher_id()
    or exists (select 1 from public.circles c
                where c.id = quizzes.circle_id
                  and c.teacher_id = public.current_teacher_id())
  )
  with check (
    public.can_supervise(academy_id)
    or created_by = public.current_teacher_id()
    or exists (select 1 from public.circles c
                where c.id = quizzes.circle_id
                  and c.teacher_id = public.current_teacher_id())
  );

create policy quizzes_delete_owner on public.quizzes
  for delete to authenticated
  using (
    public.can_supervise(academy_id)
    or created_by = public.current_teacher_id()
  );

-- --- questions and options --------------------------------------------------
-- Both reach through to the parent quiz rather than carrying an academy_id of
-- their own, so the two can never disagree about who owns them.
create policy questions_all_staff on public.quiz_questions
  for all to authenticated
  using (exists (select 1 from public.quizzes q
                  where q.id = quiz_questions.quiz_id
                    and public.is_staff_of(q.academy_id)))
  with check (exists (select 1 from public.quizzes q
                       where q.id = quiz_questions.quiz_id
                         and public.is_staff_of(q.academy_id)));

-- `to authenticated` only — never `anon`. This table holds `is_correct`.
create policy options_all_staff on public.quiz_options
  for all to authenticated
  using (exists (select 1 from public.quiz_questions qq
                  join public.quizzes q on q.id = qq.quiz_id
                 where qq.id = quiz_options.question_id
                   and public.is_staff_of(q.academy_id)))
  with check (exists (select 1 from public.quiz_questions qq
                       join public.quizzes q on q.id = qq.quiz_id
                      where qq.id = quiz_options.question_id
                        and public.is_staff_of(q.academy_id)));

-- --- attempts and answers ---------------------------------------------------
-- Staff read them to see results and to mark the written answers. Students
-- never select from these at all — `submit_quiz_attempt()` hands back the one
-- row they are entitled to.
create policy attempts_select_staff on public.quiz_attempts
  for select to authenticated
  using (exists (select 1 from public.quizzes q
                  where q.id = quiz_attempts.quiz_id
                    and public.is_staff_of(q.academy_id)));

create policy attempts_update_staff on public.quiz_attempts
  for update to authenticated
  using (exists (select 1 from public.quizzes q
                  where q.id = quiz_attempts.quiz_id
                    and public.is_staff_of(q.academy_id)))
  with check (exists (select 1 from public.quizzes q
                       where q.id = quiz_attempts.quiz_id
                         and public.is_staff_of(q.academy_id)));

create policy answers_select_staff on public.quiz_answers
  for select to authenticated
  using (exists (select 1 from public.quiz_attempts a
                  join public.quizzes q on q.id = a.quiz_id
                 where a.id = quiz_answers.attempt_id
                   and public.is_staff_of(q.academy_id)));

-- Marking a written answer is an update, not an insert: the row already exists.
create policy answers_update_staff on public.quiz_answers
  for update to authenticated
  using (exists (select 1 from public.quiz_attempts a
                  join public.quizzes q on q.id = a.quiz_id
                 where a.id = quiz_answers.attempt_id
                   and public.is_staff_of(q.academy_id)))
  with check (exists (select 1 from public.quiz_attempts a
                       join public.quizzes q on q.id = a.quiz_id
                      where a.id = quiz_answers.attempt_id
                        and public.is_staff_of(q.academy_id)));

-- =============================================================================
-- 3. Scope: is this quiz available to this circle?
--
-- Shared by every student-facing function below, so "which quizzes apply here"
-- has exactly one definition.
-- =============================================================================

create or replace function public.quiz_covers_circle(p_quiz_id uuid, p_circle_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.quizzes q
      join public.circles c on c.id = p_circle_id
     where q.id = p_quiz_id
       and q.academy_id = c.academy_id
       and q.circle_type = c.type
       -- Null circle_id = every circle of that type in the academy.
       and (q.circle_id is null or q.circle_id = c.id)
  )
$$;

-- =============================================================================
-- 4. The student's path
--
-- `attempt_id` is the bearer token for an attempt, exactly as the circle slug
-- is the bearer token for a circle: unguessable, and whoever holds it may act
-- on that one attempt. It is handed out only by `start_quiz_attempt()`, which
-- verifies the phone number first.
-- =============================================================================

-- 4.1 Which quizzes are open to this circle right now.
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
     and (q.opens_at  is null or q.opens_at  <= now())
     and (q.closes_at is null or q.closes_at >= now())
   order by q.closes_at nulls last, q.created_at;
$$;

-- 4.2 Begin — or resume — an attempt, after proving who you are.
create or replace function public.start_quiz_attempt(
  p_slug text, p_quiz_id uuid, p_student_id uuid, p_phone text
)
returns table (attempt_id uuid, resumed boolean, expires_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  v_circle  public.circles%rowtype;
  v_student public.students%rowtype;
  v_quiz    public.quizzes%rowtype;
  v_row     public.quiz_attempts%rowtype;
  v_given   text;
  v_used    int;
begin
  select * into v_circle from public.circles
   where registration_slug = p_slug and is_active;
  if not found then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;

  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found or not v_quiz.is_published then
    raise exception 'quiz_not_found' using errcode = 'P0002';
  end if;

  if not public.quiz_covers_circle(p_quiz_id, v_circle.id) then
    raise exception 'quiz_not_for_this_circle' using errcode = '42501';
  end if;

  if (v_quiz.opens_at is not null and v_quiz.opens_at > now())
     or (v_quiz.closes_at is not null and v_quiz.closes_at < now()) then
    raise exception 'quiz_closed' using errcode = '22023';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  -- Same academy and same section. `enforce_gender_match` guards attendance
  -- this way; a quiz deserves no less.
  if v_student.academy_id is distinct from v_circle.academy_id
     or v_student.gender_category is distinct from v_circle.gender_category then
    raise exception 'student_not_in_circle' using errcode = '42501';
  end if;

  -- --- identity ------------------------------------------------------------
  -- The name alone identifies nobody: it is picked from a public search box.
  -- The phone number is the thing she actually owns.
  v_given := public.normalize_phone(p_phone);

  if v_given is null or v_student.phone_key is null then
    -- A student registered before 20260830140000 made phone required has no
    -- number on file. Refusing with a distinct error lets the app say "ask
    -- your مشرفة" instead of "wrong number", which would be a lie.
    raise exception 'phone_missing' using errcode = '22023';
  end if;

  -- Exact match, or the last 9 digits. `normalize_phone` does not resolve
  -- country codes (its own comment says so), so "0501234567" and
  -- "+966501234567" produce different keys for one real line. Comparing the
  -- tail as well keeps that from locking a student out of her own quiz.
  if v_student.phone_key <> v_given
     and right(v_student.phone_key, 9) <> right(v_given, 9) then
    raise exception 'phone_mismatch' using errcode = '42501';
  end if;

  -- --- resume or start -----------------------------------------------------
  -- An attempt already running is resumed rather than restarted: a closed tab
  -- or a dropped connection must not cost her the attempt.
  select * into v_row
    from public.quiz_attempts a
   where a.quiz_id = p_quiz_id
     and a.student_id = p_student_id
     and a.status = 'in_progress'
   order by a.attempt_no desc
   limit 1;

  if found then
    return query
      select v_row.id, true,
             case when v_quiz.duration_minutes is null then null
                  else v_row.started_at + make_interval(mins => v_quiz.duration_minutes)
             end;
    return;
  end if;

  select count(*) into v_used
    from public.quiz_attempts a
   where a.quiz_id = p_quiz_id and a.student_id = p_student_id;

  if v_used >= v_quiz.max_attempts then
    raise exception 'no_attempts_left' using errcode = '42501';
  end if;

  insert into public.quiz_attempts (quiz_id, student_id, circle_id, attempt_no)
  values (p_quiz_id, p_student_id, v_circle.id, v_used + 1)
  returning * into v_row;

  return query
    select v_row.id, false,
           case when v_quiz.duration_minutes is null then null
                else v_row.started_at + make_interval(mins => v_quiz.duration_minutes)
           end;
end
$$;

-- 4.3 The paper. Note what is NOT selected: `is_correct`.
create or replace function public.quiz_for_student(p_attempt_id uuid)
returns table (
  question_id uuid,
  -- Not `position`: reserved in a RETURNS TABLE column list, same as
  -- `circle_lesson`'s `unit_position`.
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
    left join public.quiz_options qo on qo.question_id = qq.id
    left join public.quiz_answers qa
      on qa.attempt_id = a.id and qa.question_id = qq.id
   where a.id = p_attempt_id
   order by
     -- Shuffled per attempt, not per request: a refresh must not reshuffle the
     -- paper underneath her. Hashing the attempt id with the question id gives
     -- an order that is stable for this attempt and different for the next.
     case when q.shuffle_questions
          then hashtext(a.id::text || qq.id::text) end,
     qq.position,
     qo.position;
$$;

-- 4.4 Autosave, one answer at a time.
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
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id;
  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;

  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt_already_submitted' using errcode = '42501';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;

  -- The clock is the server's. The countdown in the browser is a courtesy;
  -- this is the rule, and it cannot be moved by changing the device time.
  if v_quiz.duration_minutes is not null
     and now() > v_attempt.started_at + make_interval(mins => v_quiz.duration_minutes) then
    raise exception 'time_up' using errcode = '22023';
  end if;

  if v_quiz.closes_at is not null and now() > v_quiz.closes_at then
    raise exception 'quiz_closed' using errcode = '22023';
  end if;

  -- The question must belong to this attempt's quiz — otherwise an answer
  -- could be posted against someone else's paper.
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

-- 4.5 Hand it in, and mark everything that can be marked by machine.
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
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id;
  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;

  -- Submitting twice returns the existing result rather than regrading: a
  -- double-tap on a slow connection must not look like a different score.
  if v_attempt.status <> 'in_progress' then
    return query
      select v_attempt.auto_score, v_attempt.max_score,
             (select count(*) from public.quiz_answers qa
               where qa.attempt_id = p_attempt_id and qa.is_correct is null),
             v_quiz.pass_score, v_quiz.show_results;
    return;
  end if;

  -- Grade every answered question. An unanswered one scores nothing and needs
  -- no row.
  update public.quiz_answers qa
     set is_correct = graded.correct,
         awarded_points = case when graded.correct then graded.points else 0 end
    from (
      select qq.id as question_id, qq.points, qq.kind,
             case
               -- Set equality: everything correct chosen, nothing incorrect.
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
               -- Typed answer, compared after Arabic normalization so that
               -- تشكيل and hamza spelling do not decide the mark.
               when qq.kind = 'fill_blank' then
                 exists (select 1 from public.quiz_options qo
                          where qo.question_id = qq.id and qo.is_correct
                            and public.normalize_ar(qo.text)
                              = public.normalize_ar(coalesce(ans.text_answer, '')))
               -- short_text: a person marks it. Left null below.
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

-- =============================================================================
-- 5. Grants — deny by default, then allow explicitly
-- =============================================================================

revoke execute on function public.quiz_covers_circle(uuid, uuid)               from public;
revoke execute on function public.circle_quizzes(text)                         from public;
revoke execute on function public.start_quiz_attempt(text, uuid, uuid, text)   from public;
revoke execute on function public.quiz_for_student(uuid)                       from public;
revoke execute on function public.save_quiz_answer(uuid, uuid, uuid[], text)   from public;
revoke execute on function public.submit_quiz_attempt(uuid)                    from public;

grant execute on function public.circle_quizzes(text)                       to anon, authenticated;
grant execute on function public.start_quiz_attempt(text, uuid, uuid, text) to anon, authenticated;
grant execute on function public.quiz_for_student(uuid)                     to anon, authenticated;
grant execute on function public.save_quiz_answer(uuid, uuid, uuid[], text) to anon, authenticated;
grant execute on function public.submit_quiz_attempt(uuid)                  to anon, authenticated;

-- Internal helper: called by the functions above, never from a client.
grant execute on function public.quiz_covers_circle(uuid, uuid) to authenticated;
