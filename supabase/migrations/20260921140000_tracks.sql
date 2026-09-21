-- المسارات — a 40-week memorisation cohort, and the first thing in this schema
-- that is NOT a drop-in circle.
--
-- WHY `circles` COULD NOT BE STRETCHED TO COVER IT
--
-- A حلقة is attendance in the moment: `join_circle()` opens a window at the
-- circle's start time, the student signs herself into `attendance_records`,
-- and tomorrow is a fresh row with no memory of today. There is no enrolment
-- table anywhere in this schema — by design, because until now nothing needed
-- one.
--
-- A مسار is the opposite of that. The same twenty students for forty weeks,
-- a published curriculum per week, a daily سرد that happens between two
-- students with no معلمة present at all, one weekly meeting that IS a circle,
-- a running score out of forty, and a warning ladder that ends in removal.
-- Four of those six have nowhere to live in the existing tables.
--
-- SO: `circles` keeps doing exactly what it does — and a cohort points at one
-- circle for its weekly لقاء المعلمة, reusing the queue and `recitation_logs`
-- unchanged for that one session a week. Everything else is new here.
--
-- WHAT IS DELIBERATELY NOT IN THIS MIGRATION
--
-- Scoring views, the alert generator, and the student-facing RPCs (students
-- are not authenticated in this system — see `find_me()` — so every student
-- write must be a security-definer RPC taking p_student_id, like
-- `join_circle`). Those land in 20260921150000. This file is the shape.

-- =============================================================================
-- 0. The circle type
--
-- A cohort's weekly meeting is a real circle, and `circles.type` is a FK into
-- the academy-managed `circle_types`. `records_recitation` stays true: the
-- weekly meeting is exactly where a mushaf range gets recorded.
-- =============================================================================

-- RUN AS ONE TRANSACTION.
--
-- Everything below is additive — no ALTER, no DROP, no data change on any
-- existing table; the single write outside the new tables is one row in
-- circle_types, guarded by ON CONFLICT DO NOTHING. But this file has never
-- been executed against a Postgres server, only parsed with its grammar, so
-- it runs inside BEGIN/COMMIT: any error at any point rolls the whole thing
-- back and leaves the database exactly as it was.

begin;

insert into public.circle_types (academy_id, slug, name_ar, name_en)
select a.id, 'masar', 'مسار حفظ', 'Memorisation track'
  from public.academies a
 where a.slug = 'sohbah'
on conflict (academy_id, slug) do nothing;

-- =============================================================================
-- 1. tracks — the definition. المسار الأول … المسار السادس.
--
-- Six rows, entered once. The scope columns are integers as well as prose
-- because "من الأحقاف إلى الناس" cannot answer "is سورة الملك inside this
-- track?" and `from_surah`/`to_surah` can.
-- =============================================================================

create table public.tracks (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id) on delete cascade,
  name_ar        text not null check (btrim(name_ar) <> ''),
  name_en        text not null check (btrim(name_en) <> ''),
  scope_ar       text,                     -- من الأحقاف إلى الناس
  scope_en       text,
  from_surah     smallint check (from_surah between 1 and 114),
  to_surah       smallint check (to_surah   between 1 and 114),
  duration_weeks int  not null default 40 check (duration_weeks between 1 and 200),
  daily_load_ar  text,                     -- نصف وجه يومياً
  -- One معلمة takes eight students. It is the number a new cohort starts with,
  -- not a ceiling the schema enforces: the academy changes it here, and a
  -- single cohort may still override it below.
  default_cohort_capacity int not null default 8
    check (default_cohort_capacity between 1 and 200),
  display_order  int  not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint track_scope_forward check (
    from_surah is null or to_surah is null or to_surah >= from_surah
  )
);

create index idx_tracks_academy
  on public.tracks (academy_id, display_order) where is_active;

-- =============================================================================
-- 2. track_cohorts — a running instance of a track.
--
-- THE POINT OF SPLITTING THIS FROM `tracks`:
--
-- "المسار الأول متقدم, في أسبوعه الخامس" and "المسار الأول مبتدئ, في أسبوعه
-- الأول" are the same forty weekly schedules read at two different offsets.
-- One row each here, one set of schedules shared, and nothing duplicated.
-- =============================================================================

create table public.track_cohorts (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references public.tracks(id) on delete cascade,
  academy_id  uuid not null references public.academies(id) on delete cascade,
  name_ar     text not null check (btrim(name_ar) <> ''),
  name_en     text,
  teacher_id  uuid references public.teachers(id) on delete set null,
  -- The weekly لقاء المعلمة. Null until she has created the circle.
  circle_id   uuid references public.circles(id) on delete set null,
  gender_category text not null default 'female'
    check (gender_category in ('male', 'female')),
  timezone    text not null default 'Africa/Cairo',
  start_date  date not null,
  -- Normally derived from start_date (see track_current_week). Set only when
  -- the cohort pauses — إجازة, a delayed week — and the calendar no longer
  -- tells the truth.
  week_override int check (week_override > 0),
  -- "التسجيل بالمسار متاح لمدة أسبوع فقط ثم يُغلق". This is a window on the
  -- ENROLMENT, which is why circle_registration_window() cannot serve it:
  -- that one opens and closes once per session, every session.
  registration_opens_at  timestamptz,
  registration_closes_at timestamptz,
  -- Prefilled from tracks.default_cohort_capacity when the cohort is created,
  -- and editable per cohort — a معلمة who can take ten is a row edit.
  max_students int check (max_students > 0),
  status text not null default 'draft'
    check (status in ('draft', 'registering', 'running', 'paused', 'finished')),
  created_at timestamptz not null default now(),
  constraint track_cohort_window_forward check (
    registration_opens_at is null or registration_closes_at is null
    or registration_closes_at > registration_opens_at
  ),
  -- Lets a cohort-specific week point back at its cohort AND its track in one
  -- FK, so an override can never be filed under the wrong track (§3).
  constraint uq_cohort_id_track unique (id, track_id)
);

create index idx_track_cohorts_track on public.track_cohorts (track_id, status);
create index idx_track_cohorts_teacher on public.track_cohorts (teacher_id)
  where status in ('registering', 'running');

create trigger trg_track_cohorts_validate_timezone
  before insert or update of timezone on public.track_cohorts
  for each row execute function public.validate_circle_timezone();

-- =============================================================================
-- 3. track_weeks / track_week_days — the published schedule.
--
-- Normally one set per TRACK, shared by every cohort running it — that is what
-- makes two cohorts at different weeks free. But a cohort may need its own
-- version of a week (a different pace, a make-up week), so `cohort_id` is an
-- OVERRIDE: null = the track's own schedule, set = this cohort only.
-- Resolution is in track_effective_week() below: cohort row wins if present.
-- =============================================================================

create table public.track_weeks (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references public.tracks(id) on delete cascade,
  cohort_id   uuid references public.track_cohorts(id) on delete cascade,
  week_number int not null check (week_number > 0),
  title_ar    text,
  -- The designed poster the academy circulates. Display only — the structured
  -- day rows below are what the app computes from.
  poster_url  text,
  is_published boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint fk_track_weeks_cohort
    foreign key (cohort_id, track_id)
    references public.track_cohorts (id, track_id) on delete cascade
);

-- Two partial uniques rather than one over a nullable column: in SQL, nulls
-- are never equal, so a plain unique(track_id, cohort_id, week_number) would
-- happily allow two base schedules for week 1.
create unique index uq_track_weeks_base
  on public.track_weeks (track_id, week_number) where cohort_id is null;
create unique index uq_track_weeks_cohort
  on public.track_weeks (cohort_id, week_number) where cohort_id is not null;

create table public.track_week_days (
  id        uuid primary key default gen_random_uuid(),
  week_id   uuid not null references public.track_weeks(id) on delete cascade,
  -- 0 = لقاء المعلمة · 1..5 = اليوم الأول..الخامس · 6 = الجمعة
  day_index smallint not null check (day_index between 0 and 6),
  -- الحفظ الجديد. All four null on the meeting day and on Friday.
  new_from_surah smallint check (new_from_surah between 1 and 114),
  new_from_ayah  smallint check (new_from_ayah  >= 1),
  new_to_surah   smallint check (new_to_surah   between 1 and 114),
  new_to_ayah    smallint check (new_to_ayah    >= 1),
  -- المراجعة والتثبيت — "مراجعة سورة التغابن". Prose, because that is what the
  -- schedule actually says; a surah id would lose "الطلاق، التحريم" on one row.
  review_text_ar text,
  -- The bullets under لقاء المعلمة: سؤال المراجعة، سؤال الحفظ، التصحيح.
  notes_ar       text,
  constraint uq_week_day unique (week_id, day_index),
  -- Same rule as recitation_logs: a range must move forward.
  constraint track_day_range_forward check (
    new_from_surah is null or new_to_surah is null
    or (new_to_surah, coalesce(new_to_ayah, 1))
       >= (new_from_surah, coalesce(new_from_ayah, 1))
  )
);

create index idx_track_week_days_week on public.track_week_days (week_id, day_index);

-- =============================================================================
-- 4. The rules — every number the academy argued about, as DATA.
--
-- WHY A `rule_set` AND NOT COLUMNS ON `tracks`:
--
-- The rules changed twice while the feature was being described, and the two
-- statements of the removal rule contradict each other ("٣ أيام متتالية أو ٥
-- متفرقة" vs a ladder ending at four weeks). Numbers in code mean a migration
-- and a deploy per edit; numbers in columns mean last month's score can no
-- longer be explained once someone edits them.
--
-- So a rule set is VERSIONED and IMMUTABLE in practice: editing the rules
-- writes a new set with a later `effective_from`, and a past week is always
-- scored by the set that was in force on its own dates. "لماذا حصلت على ٤٠
-- والمجموع الآن ٤٥؟" has an answer.
-- =============================================================================

create table public.track_rule_sets (
  id         uuid primary key default gen_random_uuid(),
  track_id   uuid not null references public.tracks(id) on delete cascade,
  -- Null = applies to every cohort of the track. Set = this cohort overrides.
  cohort_id  uuid references public.track_cohorts(id) on delete cascade,
  effective_from date not null default current_date,
  note       text,
  created_by uuid references public.teachers(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint uq_rule_set_scope unique (track_id, cohort_id, effective_from),
  constraint fk_rule_set_cohort
    foreign key (cohort_id, track_id)
    references public.track_cohorts (id, track_id) on delete cascade
);

create index idx_rule_sets_lookup
  on public.track_rule_sets (track_id, cohort_id, effective_from desc);

-- --- 4a. Scoring ------------------------------------------------------------
-- The weekly total is NOT stored. It is
--   points_per_recitation_day × recitation_days_per_week
--   + sum(points of the active meeting components)
-- = 5×5 + 15 = 40 at the seeded values, and 45 the moment the admin adds a
-- fourth five-point component — with 💎 following it, because a null
-- star_threshold means "the full total" rather than a frozen 40.

create table public.track_score_rules (
  rule_set_id uuid primary key
    references public.track_rule_sets(id) on delete cascade,
  points_per_recitation_day numeric(5,2) not null default 5
    check (points_per_recitation_day >= 0),
  recitation_days_per_week  smallint not null default 5
    check (recitation_days_per_week between 1 and 7),
  -- Null = the full computed total.
  star_threshold numeric(6,2) check (star_threshold >= 0)
);

create table public.track_meeting_components (
  id          uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.track_rule_sets(id) on delete cascade,
  name_ar     text not null check (btrim(name_ar) <> ''),
  name_en     text,
  points      numeric(5,2) not null default 5 check (points >= 0),
  display_order int not null default 0,
  is_active   boolean not null default true
);

create index idx_meeting_components_set
  on public.track_meeting_components (rule_set_id, display_order) where is_active;

-- --- 4b. The warning ladder -------------------------------------------------
--
-- `metric` is the column that dissolves the contradiction instead of forcing a
-- choice between the two published rules. Each row is evaluated on its own
-- measure, so "٣ أيام متتالية ⇒ نبّه المعلمة" and "٤ أسابيع ⇒ حذف" coexist in
-- one ladder, and the highest level that fires is the one shown.

create table public.track_warning_levels (
  id          uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.track_rule_sets(id) on delete cascade,
  level       smallint not null check (level > 0),
  symbol      text,                       -- 🟨 🟩 🟥 🚫
  label_ar    text not null check (btrim(label_ar) <> ''),
  label_en    text,
  metric      text not null check (metric in (
                'absence_weeks', 'consecutive_absence_days', 'scattered_absence_days'
              )),
  threshold   numeric(6,2) not null check (threshold > 0),
  action      text not null default 'warn'
                check (action in ('notify', 'warn', 'remove')),
  -- False everywhere by default, including for 'remove': the system raises an
  -- alert naming the student, a human issues the warning. Removing a student
  -- with nobody in the loop is not practically reversible.
  auto_issue  boolean not null default false,
  constraint uq_warning_level unique (rule_set_id, level)
);

-- --- 4c. What an absence is, and what forgives one --------------------------

create table public.track_absence_policy (
  rule_set_id uuid primary key
    references public.track_rule_sets(id) on delete cascade,
  -- Is "أسبوع غياب" a calendar week with no سرد at all, or simply five absent
  -- days wherever they fall? The second is harder to game; the academy picks.
  absence_week_definition text not null default 'absence_days_count'
    check (absence_week_definition in ('calendar_week_no_recitation', 'absence_days_count')),
  days_per_absence_week smallint not null default 5 check (days_per_absence_week > 0),
  -- "من تلتزم بالحضور والتتميم لمدة أسبوعين يحذف من غيابها يوم"
  reward_full_weeks   smallint not null default 2 check (reward_full_weeks > 0),
  reward_credit_days  smallint not null default 1 check (reward_credit_days > 0),
  reward_auto_apply   boolean  not null default true,
  -- Automating something in the student's favour is safe; automating removal
  -- is not. Still a switch rather than a hardcoded rule.
  removal_requires_human boolean not null default true
);

-- --- 4d. Where a quiz score lands -------------------------------------------

create table public.track_assessment_rules (
  id          uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.track_rule_sets(id) on delete cascade,
  quiz_id     uuid not null references public.quizzes(id) on delete cascade,
  points      numeric(6,2) not null default 0 check (points >= 0),
  -- Default keeps a quiz OUT of the weekly 40, so one exam week cannot quietly
  -- cost every student her 💎.
  counts_toward text not null default 'separate_total'
    check (counts_toward in ('weekly_total', 'separate_total')),
  week_number int check (week_number > 0),
  constraint uq_assessment_rule unique (rule_set_id, quiz_id)
);

-- --- 4e. Who changed a rule, and when ---------------------------------------
-- The first question when a student disputes her score.

create table public.track_rule_changes (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references public.tracks(id) on delete cascade,
  rule_set_id uuid references public.track_rule_sets(id) on delete set null,
  table_name  text not null,
  change_kind text not null check (change_kind in ('insert', 'update', 'delete')),
  before_data jsonb,
  after_data  jsonb,
  changed_by  uuid references public.teachers(id) on delete set null,
  changed_at  timestamptz not null default now()
);

create index idx_rule_changes_track
  on public.track_rule_changes (track_id, changed_at desc);

-- =============================================================================
-- 5. Enrolment, partners, and the daily سرد
-- =============================================================================

create table public.track_enrollments (
  id         uuid primary key default gen_random_uuid(),
  cohort_id  uuid not null references public.track_cohorts(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  -- A row starts life as an APPLICATION. Nobody enrols herself: the student
  -- asks, and a مشرفة/أدمن decides. 'waitlisted' is what a full cohort gives
  -- back instead of a refusal, so the queue survives someone dropping out.
  status text not null default 'pending'
    check (status in (
      'pending', 'waitlisted', 'rejected',
      'active', 'warned', 'removed', 'withdrawn', 'completed'
    )),
  requested_at timestamptz not null default now(),
  decided_by   uuid references public.teachers(id) on delete set null,
  decided_at   timestamptz,
  decision_note text,
  -- Null until the application is accepted; this is the day she actually
  -- joined, and the day her attendance starts counting.
  joined_at  timestamptz,
  left_at    timestamptz,
  removed_reason text,
  -- Days forgiven by the two-weeks-of-commitment rule. A running balance
  -- rather than recomputation, because the rule that earned it may change.
  absence_credit int not null default 0 check (absence_credit >= 0),
  constraint uq_enrollment unique (cohort_id, student_id)
);

-- "لا يُسمح بالاشتراك في أكثر من مسار" — across every cohort of every track,
-- not merely within one. This is the index that enforces it. A pending
-- application does not hold a place, so it is deliberately not counted here.
create unique index uq_one_active_track_per_student
  on public.track_enrollments (student_id)
  where status in ('active', 'warned');

-- …and one open application at a time, so a student cannot queue for all six
-- tracks and take a seat from five of them.
create unique index uq_one_open_application_per_student
  on public.track_enrollments (student_id)
  where status in ('pending', 'waitlisted');

create index idx_enrollments_cohort
  on public.track_enrollments (cohort_id, status);

-- --- الرفيقة ---------------------------------------------------------------
-- Either a student on the system or a name typed in. Not mutual by constraint:
-- she may recite to someone who does not recite to her, and the academy's own
-- wording ("أو حد من بره سردلها") allows a partner we will never have a row for.

create table public.track_partners (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.track_enrollments(id) on delete cascade,
  partner_enrollment_id uuid references public.track_enrollments(id) on delete set null,
  external_name text,
  active_from   date not null default current_date,
  active_to     date,
  created_at    timestamptz not null default now(),
  constraint partner_exactly_one check (
    (partner_enrollment_id is not null) <> (btrim(coalesce(external_name, '')) <> '')
  ),
  constraint partner_not_self check (partner_enrollment_id is distinct from enrollment_id)
);

-- One current partner at a time; history is kept by closing `active_to`.
create unique index uq_current_partner
  on public.track_partners (enrollment_id) where active_to is null;

-- --- السرد اليومي -----------------------------------------------------------
--
-- Deliberately NOT an extension of `recitation_logs`: that table's owner is a
-- circle (`circle_id not null`, and every one of its policies reaches the user
-- through `circles`), while this one's owner is an enrolment and its session
-- may have no معلمة present at all. What is reused verbatim is the shape that
-- matters — the four-integer range, the `kind` vocabulary and the rating — so
-- a single view can union the two into one history per student later.

create table public.track_recitations (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.track_enrollments(id) on delete cascade,
  cohort_id     uuid not null references public.track_cohorts(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  session_date  date not null,
  week_number   int not null check (week_number > 0),
  day_index     smallint not null check (day_index between 0 and 6),
  kind text not null default 'new'
    check (kind in ('new', 'near_review', 'far_review', 'consolidation')),
  from_surah smallint not null check (from_surah between 1 and 114),
  from_ayah  smallint not null check (from_ayah  >= 1),
  to_surah   smallint not null check (to_surah   between 1 and 114),
  to_ayah    smallint not null check (to_ayah    >= 1),
  -- To whom. Exactly one, same rule as the partner row.
  listener_student_id    uuid references public.students(id) on delete set null,
  listener_external_name text,
  rating text check (rating in ('excellent', 'very_good', 'good', 'repeat')),
  major_errors smallint not null default 0 check (major_errors >= 0),
  minor_errors smallint not null default 0 check (minor_errors >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint track_recitation_range_forward check ((to_surah, to_ayah) >= (from_surah, from_ayah)),
  constraint listener_exactly_one check (
    (listener_student_id is not null) <> (btrim(coalesce(listener_external_name, '')) <> '')
  ),
  -- One سرد per day. Recording again is a correction, so the write path upserts.
  constraint uq_recitation_per_day unique (enrollment_id, session_date)
);

create index idx_track_recitations_student
  on public.track_recitations (student_id, session_date desc);
create index idx_track_recitations_cohort
  on public.track_recitations (cohort_id, session_date desc);

-- --- Accepting an application -----------------------------------------------
--
-- Seats are finite (`track_cohorts.max_students`) and the decision is a
-- مشرفة's, so the check belongs HERE rather than in the screen she clicks:
-- two admins approving the last seat at the same moment must not both succeed.
-- The advisory lock is the same device `join_circle` already uses for the
-- last place in a circle's queue.

create or replace function public.approve_track_enrollment(
  p_enrollment_id uuid,
  p_note          text default null
)
returns public.track_enrollments
language plpgsql security definer set search_path = public
as $$
declare
  v_row    public.track_enrollments%rowtype;
  v_cohort public.track_cohorts%rowtype;
  v_taken  int;
begin
  select * into v_row from public.track_enrollments where id = p_enrollment_id;
  if not found then
    raise exception 'enrollment_not_found' using errcode = 'P0002';
  end if;

  select * into v_cohort from public.track_cohorts where id = v_row.cohort_id;

  if not public.can_supervise(v_cohort.academy_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_row.status not in ('pending', 'waitlisted') then
    raise exception 'not_an_open_application' using errcode = 'P0001';
  end if;

  -- Serialise seat assignment per cohort.
  perform pg_advisory_xact_lock(hashtext(v_cohort.id::text));

  if v_cohort.max_students is not null then
    select count(*) into v_taken
      from public.track_enrollments e
     where e.cohort_id = v_cohort.id and e.status in ('active', 'warned');

    if v_taken >= v_cohort.max_students then
      raise exception 'cohort_full' using errcode = 'P0001';
    end if;
  end if;

  update public.track_enrollments
     set status = 'active',
         joined_at = coalesce(joined_at, now()),
         decided_by = public.current_teacher_id(),
         decided_at = now(),
         decision_note = coalesce(p_note, decision_note)
   where id = p_enrollment_id
  returning * into v_row;   -- the one-active-track index fires here if she is already on one

  return v_row;
end
$$;

comment on function public.approve_track_enrollment(uuid, text) is
  'Accept an application: checks the caller supervises the academy and that a seat is free, under a per-cohort lock. Raises cohort_full when it is not.';

revoke execute on function public.approve_track_enrollment(uuid, text) from public;
grant  execute on function public.approve_track_enrollment(uuid, text) to authenticated;

-- How many seats are left, for the screen and for the public page.
create or replace function public.track_cohort_seats(p_cohort_id uuid)
returns table (taken int, capacity int, remaining int, waiting int)
language sql stable security definer set search_path = public
as $$
  select
    count(*) filter (where e.status in ('active', 'warned'))::int,
    c.max_students,
    case when c.max_students is null then null
         else greatest(c.max_students - count(*) filter (where e.status in ('active', 'warned'))::int, 0)
    end,
    count(*) filter (where e.status in ('pending', 'waitlisted'))::int
    from public.track_cohorts c
    left join public.track_enrollments e on e.cohort_id = c.id
   where c.id = p_cohort_id
   group by c.max_students;
$$;

revoke execute on function public.track_cohort_seats(uuid) from public;
grant  execute on function public.track_cohort_seats(uuid) to anon, authenticated;

-- =============================================================================
-- 6. The weekly meeting, absences, warnings, alerts
-- =============================================================================

-- One row per component per week, not one column per component — because the
-- components themselves are admin-managed rows now.
create table public.track_meeting_scores (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.track_enrollments(id) on delete cascade,
  week_number   int not null check (week_number > 0),
  meeting_date  date,
  component_id  uuid not null references public.track_meeting_components(id) on delete cascade,
  attended      boolean not null default false,
  -- Copied at the moment of recording, never recomputed. Re-weighting a
  -- component next month must not silently rewrite last month's marks.
  points_awarded numeric(5,2) not null default 0 check (points_awarded >= 0),
  excused       boolean not null default false,
  recorded_by   uuid references public.teachers(id) on delete set null,
  recorded_at   timestamptz not null default now(),
  constraint uq_meeting_score unique (enrollment_id, week_number, component_id)
);

create index idx_meeting_scores_week
  on public.track_meeting_scores (enrollment_id, week_number);

-- Absence itself is COMPUTED (a working day with no سرد). Only the exceptions
-- are stored: an accepted excuse ⛔, or a day forgiven by the reward rule.
create table public.track_absences (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.track_enrollments(id) on delete cascade,
  absence_date  date not null,
  kind text not null check (kind in ('excused', 'credited')),
  reason     text,
  created_by uuid references public.teachers(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint uq_absence_day unique (enrollment_id, absence_date)
);

-- What was actually issued, by a named human.
create table public.track_warnings (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.track_enrollments(id) on delete cascade,
  level_id      uuid references public.track_warning_levels(id) on delete set null,
  -- Copied, because the level row may be superseded by a new rule set.
  level         smallint not null,
  symbol        text,
  label_ar      text,
  absence_count numeric(6,2),
  issued_at   timestamptz not null default now(),
  issued_by   uuid references public.teachers(id) on delete set null,
  acknowledged_at timestamptz,
  revoked_at  timestamptz,
  revoked_by  uuid references public.teachers(id) on delete set null,
  note        text
);

create index idx_warnings_enrollment
  on public.track_warnings (enrollment_id, issued_at desc);

-- --- The alert, which is NOT the warning ------------------------------------
--
-- A rule computed in the dark helps nobody. When a student crosses a
-- threshold, an alert is raised NAMING HER, so the معلمة sees "نورة أحمد —
-- بلغ غيابها ٣ أسابيع 🟥" with two buttons and cannot let her slip past.
--
-- The alert is automatic and says "she is due one". The warning is a human act
-- and says "one was issued, by her". Keeping them apart is what lets removal
-- stay a decision while detection stays reliable.

create table public.track_alerts (
  id            uuid primary key default gen_random_uuid(),
  cohort_id     uuid not null references public.track_cohorts(id) on delete cascade,
  enrollment_id uuid not null references public.track_enrollments(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in (
    'warning_due', 'removal_due', 'reward_due', 'missed_today', 'streak_broken',
    -- Someone left and there are names waiting. Without this the waitlist is
    -- a list nobody ever looks at again.
    'seat_freed'
  )),
  level_id uuid references public.track_warning_levels(id) on delete set null,
  severity text not null default 'warn' check (severity in ('info', 'warn', 'critical')),
  title_ar  text not null,
  detail_ar text,
  suggested_action text check (suggested_action in
    ('issue_warning', 'remove', 'excuse', 'contact', 'grant_credit', 'admit_next')),
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'actioned', 'dismissed')),
  raised_at       timestamptz not null default now(),
  acknowledged_by uuid references public.teachers(id) on delete set null,
  acknowledged_at timestamptz,
  actioned_at     timestamptz
);

-- The same alert must not reappear every night while it sits unhandled.
create unique index uq_open_alert
  on public.track_alerts (enrollment_id, kind, coalesce(level_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'open';

create index idx_alerts_cohort_open
  on public.track_alerts (cohort_id, severity, raised_at desc) where status = 'open';

-- A place opens the moment someone is removed, withdraws or finishes. If
-- anyone is waiting, say so by name — the longest-waiting first, because a
-- queue that is not served in order is not a queue.
create or replace function public.raise_seat_freed_alert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_next public.track_enrollments%rowtype;
  v_name text;
  v_free int;
begin
  if new.status = old.status
     or new.status not in ('removed', 'withdrawn', 'completed')
     or old.status not in ('active', 'warned') then
    return new;
  end if;

  select e.* into v_next
    from public.track_enrollments e
   where e.cohort_id = new.cohort_id and e.status = 'waitlisted'
   order by e.requested_at
   limit 1;

  if not found then
    return new;
  end if;

  select s.remaining into v_free from public.track_cohort_seats(new.cohort_id) s;
  select st.name into v_name from public.students st where st.id = v_next.student_id;

  insert into public.track_alerts
    (cohort_id, enrollment_id, student_id, kind, severity,
     title_ar, detail_ar, suggested_action)
  values
    (new.cohort_id, v_next.id, v_next.student_id, 'seat_freed', 'info',
     v_name || ' — أول المنتظرات، وقد شغر مقعد',
     'المقاعد الشاغرة: ' || coalesce(v_free::text, 'غير محدودة')
       || ' · طلبها منذ ' || to_char(v_next.requested_at, 'YYYY-MM-DD'),
     'admit_next')
  on conflict do nothing;   -- uq_open_alert: one standing nudge, not one a day

  return new;
end
$$;

create trigger trg_track_enrollment_seat_freed
  after update of status on public.track_enrollments
  for each row execute function public.raise_seat_freed_alert();

-- =============================================================================
-- 7. Resolution helpers
-- =============================================================================

-- Which week is this cohort on? The manual override wins; otherwise count
-- whole weeks since start_date in the COHORT's timezone, never the viewer's —
-- the same discipline `circle_registration_window` already keeps.
create or replace function public.track_current_week(p_cohort_id uuid)
returns int
language sql stable security definer set search_path = public
as $$
  select case
           when c.week_override is not null then c.week_override
           else least(
             greatest(
               (((now() at time zone c.timezone)::date - c.start_date) / 7)::int + 1,
               1),
             t.duration_weeks)
         end
    from public.track_cohorts c
    join public.tracks t on t.id = c.track_id
   where c.id = p_cohort_id;
$$;

comment on function public.track_current_week(uuid) is
  'Which week number a cohort is on: its manual override, else whole weeks since start_date in the cohort''s own timezone, clamped to the track length.';

-- Which schedule row applies: the cohort's own override if it has one for this
-- week, otherwise the track's.
create or replace function public.track_effective_week(p_cohort_id uuid, p_week_number int)
returns uuid
language sql stable security definer set search_path = public
as $$
  select w.id
    from public.track_cohorts c
    join public.track_weeks w
      on w.track_id = c.track_id
     and w.week_number = p_week_number
     and (w.cohort_id = c.id or w.cohort_id is null)
   where c.id = p_cohort_id
   order by (w.cohort_id is null)   -- false (the override) sorts first
   limit 1;
$$;

comment on function public.track_effective_week(uuid, int) is
  'The week schedule a cohort should show: its own override for that week if one exists, else the track''s shared schedule.';

-- Which rule set governs a cohort on a given date: the most recent set already
-- in force, preferring one written for this cohort over the track-wide one.
create or replace function public.track_rule_set_for(p_cohort_id uuid, p_on date default current_date)
returns uuid
language sql stable security definer set search_path = public
as $$
  select rs.id
    from public.track_cohorts c
    join public.track_rule_sets rs
      on rs.track_id = c.track_id
     and (rs.cohort_id = c.id or rs.cohort_id is null)
     and rs.effective_from <= p_on
   where c.id = p_cohort_id
   order by (rs.cohort_id is null), rs.effective_from desc
   limit 1;
$$;

comment on function public.track_rule_set_for(uuid, date) is
  'The rule set in force for a cohort on a date. Past weeks keep the rules they were judged under — editing the rules writes a new set, it does not rewrite history.';

revoke execute on function public.track_current_week(uuid) from public;
revoke execute on function public.track_effective_week(uuid, int) from public;
revoke execute on function public.track_rule_set_for(uuid, date) from public;
grant  execute on function public.track_current_week(uuid) to anon, authenticated;
grant  execute on function public.track_effective_week(uuid, int) to anon, authenticated;
grant  execute on function public.track_rule_set_for(uuid, date) to anon, authenticated;

-- =============================================================================
-- 8. RLS
--
-- The shape follows `recitation_logs` (20260913090000): the cohort's own
-- معلمة, or a مشرفة/أدمن of that academy. Students are NOT authenticated in
-- this system, so nothing here grants them anything — their reads and writes
-- go through security-definer RPCs taking p_student_id, exactly as
-- `find_me`/`join_circle` already do.
-- =============================================================================

alter table public.tracks                  enable row level security;
alter table public.track_cohorts           enable row level security;
alter table public.track_weeks             enable row level security;
alter table public.track_week_days         enable row level security;
alter table public.track_rule_sets         enable row level security;
alter table public.track_score_rules       enable row level security;
alter table public.track_meeting_components enable row level security;
alter table public.track_warning_levels    enable row level security;
alter table public.track_absence_policy    enable row level security;
alter table public.track_assessment_rules  enable row level security;
alter table public.track_rule_changes      enable row level security;
alter table public.track_enrollments       enable row level security;
alter table public.track_partners          enable row level security;
alter table public.track_recitations       enable row level security;
alter table public.track_meeting_scores    enable row level security;
alter table public.track_absences          enable row level security;
alter table public.track_warnings          enable row level security;
alter table public.track_alerts            enable row level security;

-- --- Is this cohort mine to manage? ----------------------------------------
create or replace function public.can_manage_cohort(p_cohort_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.track_cohorts c
     where c.id = p_cohort_id
       and (c.teacher_id = public.current_teacher_id()
            or public.can_supervise(c.academy_id))
  )
$$;

revoke execute on function public.can_manage_cohort(uuid) from public;
grant  execute on function public.can_manage_cohort(uuid) to authenticated;

-- --- Definitions: public to read, admin to write ---------------------------
-- The six tracks are an advertisement; the schedules are the notice board.

create policy tracks_select on public.tracks
  for select to anon, authenticated
  using (is_active or public.is_admin_of(academy_id));
create policy tracks_write on public.tracks
  for all to authenticated
  using (public.is_admin_of(academy_id)) with check (public.is_admin_of(academy_id));

create policy cohorts_select on public.track_cohorts
  for select to anon, authenticated
  using (status in ('registering', 'running') or public.is_staff_of(academy_id));
create policy cohorts_admin_write on public.track_cohorts
  for all to authenticated
  using (public.is_admin_of(academy_id)) with check (public.is_admin_of(academy_id));
-- A معلمة may keep her own cohort moving (week override, status, its circle)
-- without being able to create or delete one.
create policy cohorts_teacher_update on public.track_cohorts
  for update to authenticated
  using (teacher_id = public.current_teacher_id())
  with check (teacher_id = public.current_teacher_id());

create policy weeks_select on public.track_weeks
  for select to anon, authenticated
  using (
    is_published
    or exists (select 1 from public.tracks t
                where t.id = track_weeks.track_id and public.is_staff_of(t.academy_id))
  );
create policy weeks_admin_write on public.track_weeks
  for all to authenticated
  using (exists (select 1 from public.tracks t
                  where t.id = track_weeks.track_id and public.is_admin_of(t.academy_id)))
  with check (exists (select 1 from public.tracks t
                  where t.id = track_weeks.track_id and public.is_admin_of(t.academy_id)));

create policy week_days_select on public.track_week_days
  for select to anon, authenticated
  using (exists (select 1 from public.track_weeks w
                  where w.id = track_week_days.week_id
                    and (w.is_published
                         or exists (select 1 from public.tracks t
                                     where t.id = w.track_id and public.is_staff_of(t.academy_id)))));
create policy week_days_admin_write on public.track_week_days
  for all to authenticated
  using (exists (select 1 from public.track_weeks w join public.tracks t on t.id = w.track_id
                  where w.id = track_week_days.week_id and public.is_admin_of(t.academy_id)))
  with check (exists (select 1 from public.track_weeks w join public.tracks t on t.id = w.track_id
                  where w.id = track_week_days.week_id and public.is_admin_of(t.academy_id)));

-- --- The rules: everyone may read, only the admin may write ----------------
-- A student is entitled to see how her score is computed and when she will be
-- warned. Rules applied to people who cannot read them are not rules.

do $$
declare t text;
begin
  foreach t in array array[
    'track_rule_sets', 'track_score_rules', 'track_meeting_components',
    'track_warning_levels', 'track_absence_policy', 'track_assessment_rules'
  ]
  loop
    execute format($f$
      create policy %1$s_select on public.%1$s
        for select to anon, authenticated using (true);
    $f$, t);
  end loop;
end $$;

create policy rule_sets_admin_write on public.track_rule_sets
  for all to authenticated
  using (exists (select 1 from public.tracks t
                  where t.id = track_rule_sets.track_id and public.is_admin_of(t.academy_id)))
  with check (exists (select 1 from public.tracks t
                  where t.id = track_rule_sets.track_id and public.is_admin_of(t.academy_id)));

-- The four child tables hang off a rule set; one predicate, written once.
create or replace function public.can_admin_rule_set(p_rule_set_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.track_rule_sets rs
      join public.tracks t on t.id = rs.track_id
     where rs.id = p_rule_set_id and public.is_admin_of(t.academy_id)
  )
$$;

revoke execute on function public.can_admin_rule_set(uuid) from public;
grant  execute on function public.can_admin_rule_set(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'track_score_rules', 'track_meeting_components',
    'track_warning_levels', 'track_absence_policy', 'track_assessment_rules'
  ]
  loop
    execute format($f$
      create policy %1$s_admin_write on public.%1$s
        for all to authenticated
        using (public.can_admin_rule_set(rule_set_id))
        with check (public.can_admin_rule_set(rule_set_id));
    $f$, t);
  end loop;
end $$;

create policy rule_changes_select on public.track_rule_changes
  for select to authenticated
  using (exists (select 1 from public.tracks t
                  where t.id = track_rule_changes.track_id and public.can_supervise(t.academy_id)));
create policy rule_changes_insert on public.track_rule_changes
  for insert to authenticated
  with check (exists (select 1 from public.tracks t
                  where t.id = track_rule_changes.track_id and public.is_admin_of(t.academy_id)));

-- --- Student records: the cohort's معلمة, or a مشرفة -----------------------

-- A معلمة SEES her cohort's roster and its pending applications; only a
-- مشرفة/أدمن may add, accept, reject or remove — which is the academy's own
-- rule ("الأدمن بس اللي بيوافق"), enforced here rather than in a screen.
create policy enrollments_select_staff on public.track_enrollments
  for select to authenticated
  using (public.can_manage_cohort(cohort_id));

create policy enrollments_admin_write on public.track_enrollments
  for all to authenticated
  using (exists (select 1 from public.track_cohorts c
                  where c.id = track_enrollments.cohort_id
                    and public.can_supervise(c.academy_id)))
  with check (exists (select 1 from public.track_cohorts c
                  where c.id = track_enrollments.cohort_id
                    and public.can_supervise(c.academy_id)));

create policy partners_staff on public.track_partners
  for all to authenticated
  using (exists (select 1 from public.track_enrollments e
                  where e.id = track_partners.enrollment_id
                    and public.can_manage_cohort(e.cohort_id)))
  with check (exists (select 1 from public.track_enrollments e
                  where e.id = track_partners.enrollment_id
                    and public.can_manage_cohort(e.cohort_id)));

create policy recitations_staff on public.track_recitations
  for all to authenticated
  using (public.can_manage_cohort(cohort_id))
  with check (public.can_manage_cohort(cohort_id));

create policy meeting_scores_staff on public.track_meeting_scores
  for all to authenticated
  using (exists (select 1 from public.track_enrollments e
                  where e.id = track_meeting_scores.enrollment_id
                    and public.can_manage_cohort(e.cohort_id)))
  with check (exists (select 1 from public.track_enrollments e
                  where e.id = track_meeting_scores.enrollment_id
                    and public.can_manage_cohort(e.cohort_id)));

create policy absences_staff on public.track_absences
  for all to authenticated
  using (exists (select 1 from public.track_enrollments e
                  where e.id = track_absences.enrollment_id
                    and public.can_manage_cohort(e.cohort_id)))
  with check (exists (select 1 from public.track_enrollments e
                  where e.id = track_absences.enrollment_id
                    and public.can_manage_cohort(e.cohort_id)));

-- A warning may be issued and revoked but never deleted: the student was told.
create policy warnings_select on public.track_warnings
  for select to authenticated
  using (exists (select 1 from public.track_enrollments e
                  where e.id = track_warnings.enrollment_id
                    and public.can_manage_cohort(e.cohort_id)));
create policy warnings_insert on public.track_warnings
  for insert to authenticated
  with check (exists (select 1 from public.track_enrollments e
                  where e.id = track_warnings.enrollment_id
                    and public.can_manage_cohort(e.cohort_id)));
create policy warnings_update on public.track_warnings
  for update to authenticated
  using (exists (select 1 from public.track_enrollments e
                  where e.id = track_warnings.enrollment_id
                    and public.can_manage_cohort(e.cohort_id)))
  with check (exists (select 1 from public.track_enrollments e
                  where e.id = track_warnings.enrollment_id
                    and public.can_manage_cohort(e.cohort_id)));

-- Alerts are the معلمة's working surface: she reads and acknowledges them.
-- Rows are raised by a security-definer job, so no insert policy is needed.
create policy alerts_select on public.track_alerts
  for select to authenticated using (public.can_manage_cohort(cohort_id));
create policy alerts_update on public.track_alerts
  for update to authenticated
  using (public.can_manage_cohort(cohort_id))
  with check (public.can_manage_cohort(cohort_id));

-- Students never reach these tables directly; the RPCs are the door.
revoke all on public.track_enrollments, public.track_partners,
              public.track_recitations, public.track_meeting_scores,
              public.track_absences, public.track_warnings, public.track_alerts
  from anon;

-- =============================================================================
-- 9. Seed — the six tracks, their 40 empty weeks, and the rules as published
--
-- Seeded, not hardcoded: every number below is a row the admin can now edit
-- from /admin/tracks/[id]/rules, and editing writes a NEW rule set rather than
-- changing these.
-- =============================================================================

insert into public.tracks
  (academy_id, name_ar, name_en, scope_ar, scope_en, from_surah, to_surah,
   duration_weeks, daily_load_ar, display_order)
select a.id, v.name_ar, v.name_en, v.scope_ar, v.scope_en, v.from_surah, v.to_surah,
       40, 'نصف وجه يومياً', v.ord
  from public.academies a
  cross join (values
    ('المسار الأول',  'Track 1', 'من البقرة إلى النساء',     'Al-Baqarah → An-Nisa',      2::smallint,  4::smallint, 1),
    ('المسار الثاني', 'Track 2', 'من المائدة إلى التوبة',    'Al-Maidah → At-Tawbah',     5::smallint,  9::smallint, 2),
    ('المسار الثالث', 'Track 3', 'من يونس إلى الكهف',        'Yunus → Al-Kahf',          10::smallint, 18::smallint, 3),
    ('المسار الرابع', 'Track 4', 'من مريم إلى القصص',        'Maryam → Al-Qasas',        19::smallint, 28::smallint, 4),
    ('المسار الخامس', 'Track 5', 'من العنكبوت إلى الجاثية',  'Al-Ankabut → Al-Jathiyah', 29::smallint, 45::smallint, 5),
    ('المسار السادس', 'Track 6', 'من الأحقاف إلى الناس',     'Al-Ahqaf → An-Nas',        46::smallint,114::smallint, 6)
  ) as v(name_ar, name_en, scope_ar, scope_en, from_surah, to_surah, ord)
 where a.slug = 'sohbah';

-- Forty empty, unpublished weeks per track, so the admin edits rows instead of
-- creating them one at a time.
insert into public.track_weeks (track_id, week_number, is_published)
select t.id, g.n, false
  from public.tracks t, generate_series(1, t.duration_weeks) as g(n);

-- The seven day rows of each week, likewise.
insert into public.track_week_days (week_id, day_index)
select w.id, d.n
  from public.track_weeks w, generate_series(0, 6) as d(n);

-- --- The rules as the academy published them, v1 ---------------------------

insert into public.track_rule_sets (track_id, effective_from, note)
select t.id, date '2000-01-01', 'القيم الابتدائية كما نُشرت في جدول دلالات الرموز'
  from public.tracks t;

-- ٥ درجات عن كل يوم سرد × ٥ أيام = ٢٥. `star_threshold` left null on purpose:
-- 💎 means "the full total", so it follows the components rather than freezing
-- at 40 the day a fourth one is added.
insert into public.track_score_rules
  (rule_set_id, points_per_recitation_day, recitation_days_per_week, star_threshold)
select rs.id, 5, 5, null from public.track_rule_sets rs;

-- ١٥ درجة لحضور الحلقة كاملة, as three separate fives — because the academy
-- marks them separately and a single "attended" flag would lose that.
insert into public.track_meeting_components (rule_set_id, name_ar, name_en, points, display_order)
select rs.id, v.name_ar, v.name_en, 5, v.ord
  from public.track_rule_sets rs
  cross join (values
    ('حضور التسميع',        'Recitation attendance', 1),
    ('حضور سؤال المراجعة',  'Review question',       2),
    ('حضور تصحيح الجديد',   'New-material correction', 3)
  ) as v(name_ar, name_en, ord);

-- The ladder, and the announcement's own thresholds alongside it as `notify`
-- rows. Both published rules survive; the academy decides from the screen
-- which one removes, by changing an action from notify to remove.
insert into public.track_warning_levels
  (rule_set_id, level, symbol, label_ar, label_en, metric, threshold, action)
select rs.id, v.level, v.symbol, v.label_ar, v.label_en, v.metric, v.threshold, v.action
  from public.track_rule_sets rs
  cross join (values
    (1, '🟨', 'إنذار أول (بلغ الغياب أسبوعاً)',    'First warning',  'absence_weeks', 1::numeric, 'warn'),
    (2, '🟩', 'إنذار ثانٍ (بلغ الغياب أسبوعين)',   'Second warning', 'absence_weeks', 2::numeric, 'warn'),
    (3, '🟥', 'إنذار أخير بالحذف (٣ أسابيع)',      'Final warning',  'absence_weeks', 3::numeric, 'warn'),
    (4, '🚫', 'الحذف النهائي (٤ أسابيع غياب)',     'Removal',        'absence_weeks', 4::numeric, 'remove'),
    (5, '⚠️', 'تنبيه: ٣ أيام غياب متتالية',        'Consecutive',    'consecutive_absence_days', 3::numeric, 'notify'),
    (6, '⚠️', 'تنبيه: ٥ أيام غياب متفرقة',         'Scattered',      'scattered_absence_days',   5::numeric, 'notify')
  ) as v(level, symbol, label_ar, label_en, metric, threshold, action);

insert into public.track_absence_policy (rule_set_id)
select rs.id from public.track_rule_sets rs;   -- all defaults, as commented above

comment on table public.tracks is 'مسار حفظ — a 40-week memorisation programme definition.';
comment on table public.track_cohorts is 'A running instance of a track: its own teacher, start date and week number. Two cohorts of one track may sit at different weeks.';
comment on table public.track_weeks is 'A week of a track''s schedule. cohort_id null = the track''s shared schedule; set = an override for that cohort only.';
comment on table public.track_rule_sets is 'A versioned set of scoring and absence rules. Editing writes a new set; past weeks keep the set that was in force on their dates.';
comment on table public.track_alerts is 'Automatic, names the student, tells the معلمة to act. Distinct from track_warnings, which records what a human then issued.';

commit;
