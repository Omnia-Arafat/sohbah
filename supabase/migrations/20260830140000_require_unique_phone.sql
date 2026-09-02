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
