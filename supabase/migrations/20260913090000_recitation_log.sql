-- سجل التسميع — what the student actually recited.
--
-- THE GAP THIS CLOSES:
--
-- `attendance_records.recitation_status` stores waiting / reciting / done. So
-- the academy knows THAT a student recited and never WHAT. For every تصحيح
-- التلاوة and تجويد circle — 18 of the 25 — that is the entire substance of
-- the session going unrecorded, and it is why nobody can answer "فين وصلت
-- فاطمة؟" without asking her معلمة from memory.
--
-- `student_unit_progress` (20260912200000) does not cover it: that table
-- tracks a curriculum UNIT — حديث ١٢، درس تجويد ٣ — which is the right shape
-- for حديث and تجويد circles and the wrong shape for حفظ, where the unit is a
-- range of ayat that changes every single session. The two are complementary
-- and both are needed.
--
-- WHY THE RANGE IS FOUR COLUMNS AND NOT A TEXT FIELD:
--
-- "من الكهف ١١ لـ ٢٦" typed into a note is unqueryable — it cannot answer how
-- far a student has got, cannot prefill next week's "من", and cannot be
-- counted. Four small integers can do all three, and they also let the UI
-- refuse a range that runs backwards.

create table public.recitation_logs (
  id uuid primary key default gen_random_uuid(),

  -- The queue row this belongs to. `set null`, never cascade: removing a
  -- student from today's queue clears the live order, it does not un-happen
  -- the recitation. Everything the log needs to stand alone is copied below.
  attendance_id uuid references public.attendance_records(id) on delete set null,

  student_id   uuid not null references public.students(id) on delete cascade,
  circle_id    uuid not null references public.circles(id)  on delete cascade,
  session_date date not null,

  -- Who recorded it. Not necessarily the circle's own معلمة — a مشرفة running
  -- the session records under her own name.
  teacher_id uuid references public.teachers(id) on delete set null,

  -- The four kinds a حفظ circle actually distinguishes. مراجعة قريبة is what
  -- she memorised recently; مراجعة بعيدة is old ground; تثبيت is the pass that
  -- makes it permanent. Collapsing them into one "review" loses the only
  -- signal that says whether her retention is holding.
  kind text not null default 'new'
    check (kind in ('new', 'near_review', 'far_review', 'consolidation')),

  from_surah smallint not null check (from_surah between 1 and 114),
  from_ayah  smallint not null check (from_ayah  >= 1),
  to_surah   smallint not null check (to_surah   between 1 and 114),
  to_ayah    smallint not null check (to_ayah    >= 1),

  rating text check (rating in ('excellent', 'very_good', 'good', 'repeat')),

  -- The two error kinds the discipline uses, counted separately. لحن جلي
  -- changes the word or the meaning; لحن خفي is a tajweed slip that does not.
  -- Kept apart because a student with ٠ جلي and ٦ خفي has a tajweed problem,
  -- not a memorisation problem — and one combined number hides exactly that.
  major_errors smallint not null default 0 check (major_errors >= 0),
  minor_errors smallint not null default 0 check (minor_errors >= 0),

  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A range must move forward. The upper ayah bound per surah is not checked
  -- here — that is the generated surah table's job (src/lib/quran/surahs.ts),
  -- and duplicating 114 bounds in a CHECK would rot the day a count is fixed.
  constraint recitation_range_forward check (
    (to_surah, to_ayah) >= (from_surah, from_ayah)
  )
);

-- One log per turn in the queue. Recording the same turn twice is a correction
-- of the first record, not a second recitation, so the write path upserts.
-- Partial: rows whose attendance row was later deleted keep no claim on it.
create unique index uq_recitation_log_attendance
  on public.recitation_logs (attendance_id)
  where attendance_id is not null;

-- "فين وصلت فاطمة؟" and the prefill for her next turn both read this way.
create index idx_recitation_logs_student
  on public.recitation_logs (student_id, session_date desc, created_at desc);

create index idx_recitation_logs_circle
  on public.recitation_logs (circle_id, session_date desc);

alter table public.recitation_logs enable row level security;

-- =============================================================================
-- Who may read and write
--
-- Same rule as the queue itself (20260904200000): the circle's own معلمة, or a
-- مشرفة/أدمن of that academy. Written out rather than delegated to a helper so
-- that reading this file tells you the rule.
-- =============================================================================

create policy recitation_logs_select_staff on public.recitation_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.circles c
       where c.id = recitation_logs.circle_id
         and (c.teacher_id = public.current_teacher_id()
              or public.can_supervise(c.academy_id))
    )
  );

create policy recitation_logs_insert_staff on public.recitation_logs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.circles c
       where c.id = recitation_logs.circle_id
         and (c.teacher_id = public.current_teacher_id()
              or public.can_supervise(c.academy_id))
    )
  );

create policy recitation_logs_update_staff on public.recitation_logs
  for update to authenticated
  using (
    exists (
      select 1 from public.circles c
       where c.id = recitation_logs.circle_id
         and (c.teacher_id = public.current_teacher_id()
              or public.can_supervise(c.academy_id))
    )
  )
  with check (
    exists (
      select 1 from public.circles c
       where c.id = recitation_logs.circle_id
         and (c.teacher_id = public.current_teacher_id()
              or public.can_supervise(c.academy_id))
    )
  );

-- Deleting a recorded recitation is a مشرفة's call. A معلمة who got it wrong
-- edits it; she does not make it disappear.
create policy recitation_logs_delete_supervisor on public.recitation_logs
  for delete to authenticated
  using (
    exists (
      select 1 from public.circles c
       where c.id = recitation_logs.circle_id
         and public.can_supervise(c.academy_id)
    )
  );

-- No anon policy of any kind. Students have no accounts, and what a named
-- student recited — with her error counts — is not public.

-- =============================================================================
-- The write path
--
-- One RPC rather than a bare insert, for three reasons the client cannot be
-- trusted with: it derives student/circle/date from the attendance row instead
-- of believing what the browser sends, it stamps the recording teacher from
-- the session, and it marks the turn 'done' in the same transaction so the log
-- and the queue can never disagree.
-- =============================================================================

create or replace function public.record_recitation(
  p_attendance_id uuid,
  p_kind          text,
  p_from_surah    smallint,
  p_from_ayah     smallint,
  p_to_surah      smallint,
  p_to_ayah       smallint,
  p_rating        text default null,
  p_major_errors  smallint default 0,
  p_minor_errors  smallint default 0,
  p_note          text default null,
  p_finish_turn   boolean default true
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_record  public.attendance_records%rowtype;
  v_teacher uuid := public.current_teacher_id();
  v_log_id  uuid;
begin
  select * into v_record
    from public.attendance_records
   where id = p_attendance_id;

  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;

  -- The same rule the RLS policies above carry. Repeated here because this
  -- function is SECURITY DEFINER: RLS never runs for it.
  if not exists (
    select 1 from public.circles c
     where c.id = v_record.circle_id
       and (c.teacher_id = v_teacher
            or public.can_supervise(c.academy_id))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.recitation_logs (
    attendance_id, student_id, circle_id, session_date, teacher_id,
    kind, from_surah, from_ayah, to_surah, to_ayah,
    rating, major_errors, minor_errors, note
  )
  values (
    p_attendance_id, v_record.student_id, v_record.circle_id,
    v_record.session_date, v_teacher,
    coalesce(p_kind, 'new'), p_from_surah, p_from_ayah, p_to_surah, p_to_ayah,
    p_rating, coalesce(p_major_errors, 0), coalesce(p_minor_errors, 0),
    nullif(btrim(p_note), '')
  )
  on conflict (attendance_id) where attendance_id is not null
  do update set
    kind         = excluded.kind,
    from_surah   = excluded.from_surah,
    from_ayah    = excluded.from_ayah,
    to_surah     = excluded.to_surah,
    to_ayah      = excluded.to_ayah,
    rating       = excluded.rating,
    major_errors = excluded.major_errors,
    minor_errors = excluded.minor_errors,
    note         = excluded.note,
    teacher_id   = excluded.teacher_id,
    updated_at   = now()
  returning id into v_log_id;

  -- Recording what she recited and marking her turn finished are one act for
  -- the معلمة, so they are one act here. Kept optional for the case where she
  -- corrects a record after the session has ended.
  if p_finish_turn then
    update public.attendance_records
       set recitation_status = 'done'
     where id = p_attendance_id;
  end if;

  return v_log_id;
end
$$;

revoke execute on function public.record_recitation(
  uuid, text, smallint, smallint, smallint, smallint,
  text, smallint, smallint, text, boolean
) from public, anon;
grant execute on function public.record_recitation(
  uuid, text, smallint, smallint, smallint, smallint,
  text, smallint, smallint, text, boolean
) to authenticated;

-- =============================================================================
-- The read paths
-- =============================================================================

-- Prefill: where this student stopped last time, anywhere in the academy —
-- not just this circle, because a student who recites in two circles is still
-- one student with one place in the mushaf.
--
-- Returns the END of her last recitation. The UI offers the next ayah as the
-- new "من", which is the commonest case and should cost no taps.
create or replace function public.last_recitation(p_student_id uuid)
returns table (
  to_surah     smallint,
  to_ayah      smallint,
  kind         text,
  session_date date
)
language sql stable security definer set search_path = public
as $$
  select rl.to_surah, rl.to_ayah, rl.kind, rl.session_date
    from public.recitation_logs rl
    join public.circles c on c.id = rl.circle_id
   where rl.student_id = p_student_id
     and (c.teacher_id = public.current_teacher_id()
          or public.can_supervise(c.academy_id))
   order by rl.session_date desc, rl.created_at desc
   limit 1;
$$;

revoke execute on function public.last_recitation(uuid) from public, anon;
grant  execute on function public.last_recitation(uuid) to authenticated;

-- Today's logs for one circle, so the queue can show which turns are already
-- recorded without a round trip per student.
create or replace function public.circle_recitation_logs(
  p_circle_id uuid,
  p_session_date date
)
returns table (
  attendance_id uuid,
  student_id    uuid,
  kind          text,
  from_surah    smallint,
  from_ayah     smallint,
  to_surah      smallint,
  to_ayah       smallint,
  rating        text,
  major_errors  smallint,
  minor_errors  smallint,
  note          text
)
language sql stable security definer set search_path = public
as $$
  select rl.attendance_id, rl.student_id, rl.kind,
         rl.from_surah, rl.from_ayah, rl.to_surah, rl.to_ayah,
         rl.rating, rl.major_errors, rl.minor_errors, rl.note
    from public.recitation_logs rl
    join public.circles c on c.id = rl.circle_id
   where rl.circle_id = p_circle_id
     and rl.session_date = p_session_date
     and (c.teacher_id = public.current_teacher_id()
          or public.can_supervise(c.academy_id));
$$;

revoke execute on function public.circle_recitation_logs(uuid, date) from public, anon;
grant  execute on function public.circle_recitation_logs(uuid, date) to authenticated;

comment on table public.recitation_logs is
  'What a student recited in one turn: range, kind, rating and error counts.';
