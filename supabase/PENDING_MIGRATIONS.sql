-- =============================================================================
-- Pending Sohbah migrations, in dependency order.
-- Paste the whole file into the Supabase SQL editor and run it once.
--
-- SAFE FOR EXISTING DATA. No DELETE, no UPDATE, no DROP TABLE anywhere. Every
-- student already registered keeps their record, their phone and their whole
-- attendance history, including students who share a number.
--
-- Students: phone required for new registrations, NOT unique (siblings share
--           one parent number).
-- Teachers: one account per number, strictly — that column is new and empty.
--
-- Safe to re-run.
-- =============================================================================


-- ##### 20260830120000_joined_means_present.sql #####################

-- Joining a circle is the attendance mark.
--
-- A student reaches `attendance_records` only through join_circle(), which
-- means they opened the circle link and took a place in the queue. Asking the
-- teacher to then tick "present" recorded nothing the row did not already
-- prove, so the teacher-side toggle is gone and the default carries the fact.
--
-- 'pending' and 'absent' stay in the check constraint: historical rows keep
-- their recorded value, and attendance_report() still counts all three. What
-- changes is that new rows land as 'present' instead of waiting for a tick
-- that the UI no longer offers.
--
-- Deliberately NOT backfilled. Existing 'pending' rows are a true record of
-- sessions nobody marked; rewriting them to 'present' would invent attendance
-- that was never confirmed.

alter table public.attendance_records
  alter column attendance_status set default 'present';


-- ##### 20260830130000_report_recitation.sql ########################

-- Report on recitation, not attendance.
--
-- Joining the queue is now the attendance mark (see the previous migration), so
-- `sessions_present` counted the same thing as `sessions_joined` and the
-- present/absent/unmarked split carried no information.
--
-- The question the report actually needs to answer is the one attendance can no
-- longer express: a student turned up and took a place in the order, but the
-- session ended without them reciting. That is `recitation_status <> 'done'`.
--
-- Return type changes, so drop + recreate, then re-grant.

-- The 6-arg form from 20260810000000; the 7-arg drop makes this re-runnable.
drop function if exists public.attendance_report(date, date, text, uuid, uuid, uuid);
drop function if exists public.attendance_report(date, date, text, uuid, uuid, uuid, text);

create function public.attendance_report(
  p_from        date,
  p_to          date,
  p_gender      text default null,
  p_circle_id   uuid default null,
  p_teacher_id  uuid default null,
  p_academy_id  uuid default null,
  -- Circle *type* (tasheeh / tajweed / free_recitation), not a specific circle:
  -- "how are the tajweed circles doing" is a different question from
  -- "how is Friday's tajweed circle doing".
  p_circle_type text default null
)
returns table (
  student_id           uuid,
  student_name         text,
  father_name          text,
  gender_category      text,
  sessions_joined      bigint,
  sessions_recited     bigint,
  sessions_not_recited bigint
)
language sql stable security definer set search_path = public
as $$
  select s.id, s.name, s.father_name, s.gender_category,
         count(*),
         count(*) filter (where ar.recitation_status =  'done'),
         -- 'waiting' and 'reciting' both mean the session ended without a
         -- finished recitation; only 'done' counts as recited.
         count(*) filter (where ar.recitation_status is distinct from 'done')
    from public.attendance_records ar
    join public.students s on s.id = ar.student_id
    join public.circles  c on c.id = ar.circle_id
   where public.is_admin()                      -- non-admins get an empty result
     and ar.session_date between p_from and p_to
     and (p_gender     is null or s.gender_category = p_gender)
     and (p_circle_id  is null or c.id              = p_circle_id)
     and (p_teacher_id is null or c.teacher_id      = p_teacher_id)
     and (p_academy_id is null or c.academy_id      = p_academy_id)
     and (p_circle_type is null or c.type           = p_circle_type)
   group by s.id, s.name, s.father_name, s.gender_category
   order by 6 desc, 5 desc, s.name;
$$;

revoke execute on function public.attendance_report(date, date, text, uuid, uuid, uuid, text) from public;
revoke execute on function public.attendance_report(date, date, text, uuid, uuid, uuid, text) from anon;
grant  execute on function public.attendance_report(date, date, text, uuid, uuid, uuid, text) to authenticated;


-- ##### 20260830140000_require_unique_phone.sql #####################

-- Phone becomes required, and becomes the identity key.
--
-- Names do not identify anyone here: `father_name` is written as '-' by the
-- simplified registration form, so find_similar_students() collapses every
-- student sharing a first name into one "possible duplicate" warning that
-- people click past. A phone number is the one thing a student actually owns.

-- --- Normalization ----------------------------------------------------------
-- Compared as digits so the same line cannot register twice under different
-- punctuation: "+966 50 123 4567", "00966501234567" and "0966501234567" all
-- reduce to the same key.
--
-- LIMITATION: this does not resolve country codes. A student entering
-- "0501234567" locally and "+966501234567" later produces two different keys
-- and can still register twice. Fixing that needs a per-academy default country
-- code to canonicalize against, which the schema does not carry yet.
create or replace function public.normalize_phone(txt text)
returns text
language sql
immutable
as $$
  select nullif(
           regexp_replace(
             -- '00' is the international prefix; drop it so it matches '+'
             regexp_replace(btrim(coalesce(txt, '')), '^00', ''),
             '[^0-9]', '', 'g'
           ),
           ''
         )
$$;

comment on function public.normalize_phone(text) is
  'Immutable digits-only phone key used for students.phone_key. Safe for indexes.';

-- --- Identity key -----------------------------------------------------------
alter table public.students
  add column if not exists phone_key text
    generated always as (public.normalize_phone(phone)) stored;

-- Deliberately NOT unique for students.
--
-- Students are children, and siblings share one parent's WhatsApp number — the
-- table already holds such pairs, with real attendance history behind them. A
-- unique index is validated against the whole table the moment it is created,
-- so adding one would have meant deleting a real student first, and
-- `attendance_records.student_id` is ON DELETE CASCADE: that delete takes their
-- entire attendance record with it. It would also permanently block the next
-- sibling from ever registering.
--
-- The number is still required (see the constraint below), and
-- find_similar_students() still warns when a matching name is already
-- registered. What is not enforced here is one-number-one-student.
--
-- One account per number IS enforced for teachers and supervisors, in
-- 20260830150000: that column is new and empty, so a unique index there is both
-- safe and correct — a teacher is one person with one account.
create index if not exists idx_students_phone_per_academy
  on public.students (academy_id, phone_key)
  where phone_key is not null;

-- Drop the stricter rule if an earlier version of this migration installed it.
drop trigger if exists trg_students_unique_phone on public.students;
drop function if exists public.enforce_unique_student_phone();

-- --- Required ---------------------------------------------------------------
-- NOT VALID rather than `set not null`: rows predating this migration may have
-- no phone, and a plain NOT NULL would either fail the migration or force us to
-- invent numbers. NOT VALID enforces the rule on every insert and update from
-- here on while leaving that history readable.
--
-- Note the consequence: editing a legacy student who has no phone will now
-- require giving them one before the row will save.
--
-- Once the existing rows are filled in, promote it:
--     alter table public.students validate constraint students_phone_required;
--     -- and then, optionally:
--     alter table public.students alter column phone set not null;
--
-- Find the rows that still need a number:
--     select id, name, created_at from public.students where phone_key is null;
alter table public.students
  drop constraint if exists students_phone_required;

alter table public.students
  add constraint students_phone_required
    check (public.normalize_phone(phone) is not null) not valid;


-- ##### 20260830150000_teacher_self_registration.sql ################

-- Teachers and supervisors apply for themselves; an admin approves.
--
-- Until now every teacher was created by hand in the SQL editor
-- (supabase/seed/first-admin.sql), which does not scale past the first few.
--
-- The applicant supplies a name and a phone number only. No login is created
-- here: `auth_user_id` stays null, and an admin still creates the Auth user and
-- links it once they have approved the person. That keeps this endpoint unable
-- to mint credentials, which matters because it is reachable without auth.

-- --- Contact details --------------------------------------------------------
alter table public.teachers
  add column if not exists phone text;

alter table public.teachers
  add column if not exists phone_key text
    generated always as (public.normalize_phone(phone)) stored;

-- Stops one person submitting the same application repeatedly, and makes the
-- phone the same identity key it is for students.
create unique index if not exists uq_teachers_phone_per_academy
  on public.teachers (academy_id, phone_key)
  where phone_key is not null;

-- --- Application endpoint ---------------------------------------------------
-- SECURITY DEFINER because `teachers_admin_insert` requires an existing admin,
-- which an applicant is not. The function is the whole trust boundary, so it
-- validates every field itself and hard-codes the two things that must never
-- come from the caller:
--
--   is_active   = false  -> the row grants nothing until an admin flips it
--   auth_user_id = null  -> no sign-in is attached, so 'admin' is inert here
--
-- A requested role of 'admin' is therefore a request, not a grant.
create or replace function public.register_teacher(
  p_academy_id uuid,
  p_name       text,
  p_phone      text,
  p_role       text,
  p_gender     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
begin
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if public.normalize_phone(v_phone) is null then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  if p_role not in ('teacher', 'admin') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if p_gender not in ('male', 'female') then
    raise exception 'invalid_gender' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.academies a where a.id = p_academy_id and a.is_active
  ) then
    raise exception 'academy_not_found' using errcode = 'P0002';
  end if;

  insert into public.teachers (
    academy_id, name, phone, gender_category, role, is_active, auth_user_id
  )
  values (p_academy_id, v_name, v_phone, p_gender, p_role, false, null);

exception
  -- uq_teachers_phone_per_academy: someone already applied with this number.
  when unique_violation then
    raise exception 'phone_taken' using errcode = '23505';
end
$$;

revoke execute on function public.register_teacher(uuid, text, text, text, text) from public;
grant  execute on function public.register_teacher(uuid, text, text, text, text) to anon, authenticated;


-- ##### 20260830160000_teacher_form_role_only.sql ###################

-- The application form asks for name, role and phone — nothing else.
--
-- `p_gender` was the odd one out: `teachers.gender_category` is NOT NULL, but
-- unlike the equivalent column on `students` and `circles` it gates nothing.
-- No RLS policy reads it, `enforce_gender_match()` does not consult it, and no
-- RPC filters on it — it is display-only in the admin list. Asking an applicant
-- for it to satisfy a constraint was the tail wagging the dog.
--
-- It now defaults, and an admin can correct it on the teacher edit screen. The
-- default is 'female' because this academy's teaching staff is female; change
-- the literal below if that stops being true.
--
-- Signature is unchanged (same argument types in the same order), so this is a
-- plain replace and existing grants carry over.
create or replace function public.register_teacher(
  p_academy_id uuid,
  p_name       text,
  p_phone      text,
  p_role       text,
  p_gender     text default 'female'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
begin
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if public.normalize_phone(v_phone) is null then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  -- 'admin' here is the مشرفة role people apply for. It still grants nothing
  -- until an admin approves the row *and* links an Auth user by hand.
  if p_role not in ('teacher', 'admin') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if p_gender not in ('male', 'female') then
    raise exception 'invalid_gender' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.academies a where a.id = p_academy_id and a.is_active
  ) then
    raise exception 'academy_not_found' using errcode = 'P0002';
  end if;

  insert into public.teachers (
    academy_id, name, phone, gender_category, role, is_active, auth_user_id
  )
  values (p_academy_id, v_name, v_phone, p_gender, p_role, false, null);

exception
  when unique_violation then
    raise exception 'phone_taken' using errcode = '23505';
end
$$;


-- ##### 20260830170000_staff_read_access.sql ########################

-- One tier for now: every approved person sees the same thing.
--
-- معلمة and مشرفة currently differ only in what they may *change*. Reads are
-- opened up to any approved staff member so the admin screens show real data
-- instead of the empty tables `is_admin()` would leave behind.
--
-- Nothing here grants a write. Every UPDATE/DELETE/INSERT policy still checks
-- `is_admin()`, and the server actions re-check on their own. When the real
-- per-role permissions are defined, this migration is what they replace.

-- --- Who counts as staff -----------------------------------------------------
-- Approved and linked to a sign-in. A pending application has no auth user, so
-- it cannot satisfy this.
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teachers
     where auth_user_id = auth.uid() and is_active
  )
$$;

comment on function public.is_staff() is
  'Any approved teacher or supervisor. Read-side only — writes still use is_admin().';

revoke execute on function public.is_staff() from public;
grant  execute on function public.is_staff() to authenticated;

-- --- Teachers: the staff list is visible to staff ----------------------------
drop policy if exists teachers_select_self_or_admin on public.teachers;
create policy teachers_select_self_or_staff on public.teachers
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_staff());

-- --- Circles: every circle is visible, not only your own ---------------------
drop policy if exists circles_select_own_or_admin on public.circles;
create policy circles_select_own_or_staff on public.circles
  for select to authenticated
  using (teacher_id = public.current_teacher_id() or public.is_staff());

-- --- Students: the roster is visible to staff --------------------------------
-- Replaces the admin-or-own-circles rule from 20260810000000.
drop policy if exists students_select_own_circles on public.students;
create policy students_select_staff on public.students
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1
        from public.attendance_records ar
        join public.circles c on c.id = ar.circle_id
       where ar.student_id  = students.id
         and c.teacher_id   = public.current_teacher_id()
         and c.academy_id   = students.academy_id
    )
  );

-- --- Reports: readable by staff ---------------------------------------------
-- Only the `is_admin()` gate in the WHERE clause changes; the shape and the
-- rest of the filters are exactly as in 20260830130000.
create or replace function public.attendance_report(
  p_from        date,
  p_to          date,
  p_gender      text default null,
  p_circle_id   uuid default null,
  p_teacher_id  uuid default null,
  p_academy_id  uuid default null,
  p_circle_type text default null
)
returns table (
  student_id           uuid,
  student_name         text,
  father_name          text,
  gender_category      text,
  sessions_joined      bigint,
  sessions_recited     bigint,
  sessions_not_recited bigint
)
language sql stable security definer set search_path = public
as $$
  select s.id, s.name, s.father_name, s.gender_category,
         count(*),
         count(*) filter (where ar.recitation_status =  'done'),
         count(*) filter (where ar.recitation_status is distinct from 'done')
    from public.attendance_records ar
    join public.students s on s.id = ar.student_id
    join public.circles  c on c.id = ar.circle_id
   where public.is_staff()                     -- non-staff get an empty result
     and ar.session_date between p_from and p_to
     and (p_gender      is null or s.gender_category = p_gender)
     and (p_circle_id   is null or c.id              = p_circle_id)
     and (p_teacher_id  is null or c.teacher_id      = p_teacher_id)
     and (p_academy_id  is null or c.academy_id      = p_academy_id)
     and (p_circle_type is null or c.type            = p_circle_type)
   group by s.id, s.name, s.father_name, s.gender_category
   order by 6 desc, 5 desc, s.name;
$$;
