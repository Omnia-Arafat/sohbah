-- تحديات الأذكار — challenges any معلمة or مشرفة can create, around one ذكر.
--
-- ADDITIVE, WITH ONE EXCEPTION. Two new tables and new functions, plus ONE
-- replaced existing function: friday_challenge_board (section 6), which
-- showed مشرفات both sides' names. It now shows only her own side, as
-- 20260927110000 does for every other staff read; an admin still sees both.
-- No table, column, policy or row of تحدي الجمعة changes — the app shows it
-- first among the challenges on a Friday, its data untouched.
--
-- SIDES: a challenge belongs to the side of the one who made it
-- (gender_category, copied from her teachers row). Only students of that side
-- can see it or count on it, and only staff of that side — or an admin —
-- see its results.
--
-- WHAT IS STORED: the challenge (its ذكر, the hadith of its virtue, the
-- SOURCE — required, so no hadith is ever published without saying who
-- narrated it — the badge family, the goal, and how often it resets), and per
-- person per period, one count. Badges are never stored: they are drawn from
-- the count, as تحدي الجمعة's are.
--
-- PERIODS: 'day' resets daily, 'week' weekly (the week starts Saturday),
-- 'once' never. The device computes the period key in its own timezone; the
-- database only checks it is plausible for today, as the Friday challenge
-- does.
--
-- WHO SEES WHAT: a challenge for everyone is public to the academy; one for a
-- حلقة is listed to that حلقة's students (by attendance, as صفحتي knows them)
-- and to staff. Anyone with the link can still open it — the link is how a
-- معلمة shares it.
--
-- MERGING: a save keeps the LARGER count, so a late or repeated save from an
-- older copy on the phone can never take anything away.

create table if not exists public.dhikr_challenges (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  slug        text not null unique,
  preset      text,
  title       text not null check (char_length(btrim(title)) between 1 and 80),
  dhikr       text not null check (char_length(btrim(dhikr)) between 1 and 400),
  virtue      text not null default '' check (char_length(virtue) <= 600),
  source      text not null check (char_length(btrim(source)) between 3 and 200),
  family      text not null check (family in ('leaf','tree','palm','treasure','sea','scale','fortress','scroll','sky')),
  goal        integer not null check (goal between 1 and 100000),
  period      text not null check (period in ('day','week','once')),
  circle_id   uuid references public.circles(id) on delete cascade,
  gender_category text not null check (gender_category in ('male','female')),
  created_by  uuid references public.teachers(id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists dhikr_challenges_academy_active
  on public.dhikr_challenges (academy_id, is_active, created_at desc);

create table if not exists public.dhikr_challenge_counts (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.dhikr_challenges(id) on delete cascade,
  period_key   date not null,
  student_id   uuid references public.students(id) on delete cascade,
  teacher_id   uuid references public.teachers(id) on delete cascade,
  total        integer not null default 0 check (total between 0 and 1000000),
  -- When the count last went UP: the tie-break, "who reached it first".
  reached_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint dhikr_counts_one_person check (num_nonnulls(student_id, teacher_id) = 1)
);

create unique index if not exists dhikr_counts_student
  on public.dhikr_challenge_counts (challenge_id, period_key, student_id) where student_id is not null;
create unique index if not exists dhikr_counts_teacher
  on public.dhikr_challenge_counts (challenge_id, period_key, teacher_id) where teacher_id is not null;

-- No policies: every door is one of the functions below.
alter table public.dhikr_challenges enable row level security;
alter table public.dhikr_challenge_counts enable row level security;
revoke all on public.dhikr_challenges from anon, authenticated;
revoke all on public.dhikr_challenge_counts from anon, authenticated;

-- =============================================================================
-- Helpers
-- =============================================================================

-- A period key that is plausible today, in any timezone the academy meets in.
create or replace function public.dhikr_valid_period(p_period text, p_key date)
returns boolean
language sql stable
as $$
  select case p_period
    when 'day'  then p_key between current_date - 1 and current_date + 1
    when 'week' then extract(isodow from p_key) = 6
                     and p_key between current_date - 8 and current_date + 1
    when 'once' then p_key = date '2000-01-01'
    else false
  end
$$;

-- The student, if the phone she sent is hers; null otherwise. Same credential
-- as صفحتي (20260913120000): exact match or the last nine digits.
create or replace function public.dhikr_verified_student(p_student_id uuid, p_phone text)
returns public.students
language plpgsql stable security definer set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_given   text;
begin
  if p_student_id is null then
    return null;
  end if;
  select * into v_student from public.students where id = p_student_id;
  if not found then
    return null;
  end if;
  v_given := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if v_student.phone_key is null
     or char_length(v_given) < 9
     or (v_student.phone_key <> v_given
         and right(v_student.phone_key, 9) <> right(v_given, 9)) then
    return null;
  end if;
  return v_student;
end
$$;

revoke execute on function public.dhikr_verified_student(uuid, text) from public;

-- The signed-in active معلمة/مشرفة, or null.
create or replace function public.dhikr_current_teacher()
returns public.teachers
language sql stable security definer set search_path = public
as $$
  select * from public.teachers where auth_user_id = auth.uid() and is_active limit 1
$$;

revoke execute on function public.dhikr_current_teacher() from public;

-- =============================================================================
-- 1. The list — what a reader of this academy can see right now
-- =============================================================================

create or replace function public.dhikr_challenges_list(
  p_academy_slug text,
  p_student_id   uuid default null,
  p_phone        text default null
)
returns table (
  id          uuid,
  slug        text,
  preset      text,
  title       text,
  dhikr       text,
  virtue      text,
  source      text,
  family      text,
  goal        integer,
  period      text,
  circle_name text,
  created_at  timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_academy uuid;
  v_student public.students%rowtype;
  v_teacher public.teachers%rowtype;
begin
  select a.id into v_academy from public.academies a where a.slug = p_academy_slug and a.is_active;
  if not found then
    raise exception 'academy_not_found' using errcode = 'P0002';
  end if;

  v_student := public.dhikr_verified_student(p_student_id, p_phone);
  v_teacher := public.dhikr_current_teacher();

  return query
    select c.id, c.slug, c.preset, c.title, c.dhikr, c.virtue, c.source,
           c.family, c.goal, c.period, ci.name, c.created_at
      from public.dhikr_challenges c
      left join public.circles ci on ci.id = c.circle_id
     where c.academy_id = v_academy
       and c.is_active
       and (
         -- Staff: their own side (an admin both), every حلقة.
         (v_teacher.id is not null and v_teacher.academy_id = v_academy
            and public.staff_sees_gender(v_academy, c.gender_category))
         -- A student: her own side, and a حلقة challenge only if it is hers.
         or (v_student.id is not null and v_student.academy_id = v_academy
             and v_student.gender_category = c.gender_category
             and (c.circle_id is null or exists (
                   select 1 from public.attendance_records ar
                    where ar.student_id = v_student.id and ar.circle_id = c.circle_id)))
       )
     order by c.created_at desc;
end
$$;

revoke execute on function public.dhikr_challenges_list(text, uuid, text) from public;
grant  execute on function public.dhikr_challenges_list(text, uuid, text) to anon, authenticated;

-- =============================================================================
-- 2. One challenge, by its link
--
-- Returns its side too: the page shows it only to that side (src/lib/
-- viewer.ts), and every save below refuses the other side regardless.
-- =============================================================================

create or replace function public.dhikr_challenge_by_slug(p_academy_slug text, p_slug text)
returns table (
  id          uuid,
  slug        text,
  preset      text,
  title       text,
  dhikr       text,
  virtue      text,
  source      text,
  family      text,
  goal        integer,
  period      text,
  circle_name text,
  is_active   boolean,
  created_by  uuid,
  gender_category text
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.slug, c.preset, c.title, c.dhikr, c.virtue, c.source,
         c.family, c.goal, c.period, ci.name, c.is_active, c.created_by, c.gender_category
    from public.dhikr_challenges c
    join public.academies a on a.id = c.academy_id and a.slug = p_academy_slug
    left join public.circles ci on ci.id = c.circle_id
   where c.slug = p_slug
$$;

revoke execute on function public.dhikr_challenge_by_slug(text, text) from public;
grant  execute on function public.dhikr_challenge_by_slug(text, text) to anon, authenticated;

-- =============================================================================
-- 3. Saving a count — a student, or a member of staff
-- =============================================================================

create or replace function public.dhikr_challenge_save_student(
  p_challenge_id uuid,
  p_student_id   uuid,
  p_phone        text,
  p_period_key   date,
  p_total        integer
)
returns table (total integer)
language plpgsql volatile security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_challenge public.dhikr_challenges%rowtype;
  v_student   public.students%rowtype;
begin
  select * into v_challenge from public.dhikr_challenges where id = p_challenge_id and is_active;
  if not found then
    raise exception 'challenge_not_found' using errcode = 'P0002';
  end if;

  v_student := public.dhikr_verified_student(p_student_id, p_phone);
  if v_student.id is null or v_student.academy_id <> v_challenge.academy_id then
    raise exception 'phone_mismatch' using errcode = '42501';
  end if;
  if v_student.gender_category <> v_challenge.gender_category then
    raise exception 'other_side' using errcode = '42501';
  end if;

  if not public.dhikr_valid_period(v_challenge.period, p_period_key) then
    raise exception 'bad_period' using errcode = '22023';
  end if;

  insert into public.dhikr_challenge_counts as e (challenge_id, period_key, student_id, total)
  values (p_challenge_id, p_period_key, v_student.id, least(greatest(coalesce(p_total, 0), 0), 1000000))
  on conflict (challenge_id, period_key, student_id) where student_id is not null
  do update set
    total      = greatest(e.total, excluded.total),
    reached_at = case when excluded.total > e.total then now() else e.reached_at end,
    updated_at = now();

  return query
    select e.total from public.dhikr_challenge_counts e
     where e.challenge_id = p_challenge_id and e.period_key = p_period_key and e.student_id = v_student.id;
end
$$;

revoke execute on function public.dhikr_challenge_save_student(uuid, uuid, text, date, integer) from public;
grant  execute on function public.dhikr_challenge_save_student(uuid, uuid, text, date, integer) to anon, authenticated;

create or replace function public.dhikr_challenge_save_staff(
  p_challenge_id uuid,
  p_period_key   date,
  p_total        integer
)
returns table (total integer)
language plpgsql volatile security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_challenge public.dhikr_challenges%rowtype;
  v_teacher   public.teachers%rowtype;
begin
  select * into v_challenge from public.dhikr_challenges where id = p_challenge_id and is_active;
  if not found then
    raise exception 'challenge_not_found' using errcode = 'P0002';
  end if;

  v_teacher := public.dhikr_current_teacher();
  if v_teacher.id is null or v_teacher.academy_id <> v_challenge.academy_id
     or not public.staff_sees_gender(v_challenge.academy_id, v_challenge.gender_category) then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  if not public.dhikr_valid_period(v_challenge.period, p_period_key) then
    raise exception 'bad_period' using errcode = '22023';
  end if;

  insert into public.dhikr_challenge_counts as e (challenge_id, period_key, teacher_id, total)
  values (p_challenge_id, p_period_key, v_teacher.id, least(greatest(coalesce(p_total, 0), 0), 1000000))
  on conflict (challenge_id, period_key, teacher_id) where teacher_id is not null
  do update set
    total      = greatest(e.total, excluded.total),
    reached_at = case when excluded.total > e.total then now() else e.reached_at end,
    updated_at = now();

  return query
    select e.total from public.dhikr_challenge_counts e
     where e.challenge_id = p_challenge_id and e.period_key = p_period_key and e.teacher_id = v_teacher.id;
end
$$;

revoke execute on function public.dhikr_challenge_save_staff(uuid, date, integer) from public;
grant  execute on function public.dhikr_challenge_save_staff(uuid, date, integer) to authenticated;

-- =============================================================================
-- 4. Creating, and stopping
--
-- Any active معلمة or مشرفة may create one. The source is required by the
-- table itself; this only trims and checks the rest.
-- =============================================================================

create or replace function public.dhikr_challenge_create(
  p_preset    text,
  p_title     text,
  p_dhikr     text,
  p_virtue    text,
  p_source    text,
  p_family    text,
  p_goal      integer,
  p_period    text,
  p_circle_id uuid default null
)
returns text
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  v_teacher public.teachers%rowtype;
  v_slug    text;
begin
  v_teacher := public.dhikr_current_teacher();
  if v_teacher.id is null then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  if p_circle_id is not null and not exists (
       select 1 from public.circles where id = p_circle_id and academy_id = v_teacher.academy_id) then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;

  v_slug := substr(md5(gen_random_uuid()::text), 1, 8);

  insert into public.dhikr_challenges
         (academy_id, slug, preset, title, dhikr, virtue, source, family, goal, period, circle_id,
          gender_category, created_by)
  values (v_teacher.academy_id, v_slug, nullif(btrim(p_preset), ''), btrim(p_title), btrim(p_dhikr),
          btrim(coalesce(p_virtue, '')), btrim(p_source), p_family, p_goal, p_period, p_circle_id,
          v_teacher.gender_category, v_teacher.id);

  return v_slug;
end
$$;

revoke execute on function public.dhikr_challenge_create(text, text, text, text, text, text, integer, text, uuid) from public;
grant  execute on function public.dhikr_challenge_create(text, text, text, text, text, text, integer, text, uuid) to authenticated;

-- The one who made it, or a مشرفة of that academy and side (an admin: any).
create or replace function public.dhikr_challenge_can_manage(p_challenge_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.dhikr_challenges c
     where c.id = p_challenge_id
       and (c.created_by = (public.dhikr_current_teacher()).id
            or (public.can_supervise(c.academy_id)
                and public.staff_sees_gender(c.academy_id, c.gender_category)))
  )
$$;

revoke execute on function public.dhikr_challenge_can_manage(uuid) from public;
grant  execute on function public.dhikr_challenge_can_manage(uuid) to authenticated;

create or replace function public.dhikr_challenge_set_active(p_challenge_id uuid, p_active boolean)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  if not public.dhikr_challenge_can_manage(p_challenge_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.dhikr_challenges set is_active = p_active where id = p_challenge_id;
end
$$;

revoke execute on function public.dhikr_challenge_set_active(uuid, boolean) from public;
grant  execute on function public.dhikr_challenge_set_active(uuid, boolean) to authenticated;

-- =============================================================================
-- 5. Who took part, in order — for the one who made it, and مشرفات
-- =============================================================================

create or replace function public.dhikr_challenge_stats(p_challenge_id uuid, p_period_key date)
returns table (
  person_name text,
  person_kind text,
  person_total integer,
  person_reached timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.dhikr_challenge_can_manage(p_challenge_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return query
    select coalesce(
             case when s.id is not null then
               s.name || case when nullif(btrim(s.father_name), '-') is not null
                              then ' ' || btrim(s.father_name) else '' end
             end,
             t.name
           ),
           case
             when s.id is not null then 'student'
             when t.roles && array['supervisor', 'admin']::text[] then 'supervisor'
             else 'teacher'
           end,
           e.total, e.reached_at
      from public.dhikr_challenge_counts e
      left join public.students s on s.id = e.student_id
      left join public.teachers t on t.id = e.teacher_id
     where e.challenge_id = p_challenge_id
       and e.period_key = p_period_key
       and e.total > 0
     order by e.total desc, e.reached_at asc;
end
$$;

revoke execute on function public.dhikr_challenge_stats(uuid, date) from public;
grant  execute on function public.dhikr_challenge_stats(uuid, date) to authenticated;

-- =============================================================================
-- 6. تحدي الجمعة's board, own side only — REPLACES the 20260925120000 version
--
-- The same body with one condition added: each row's person must be on the
-- مشرفة's side (staff_sees_gender, from 20260927110000). An admin still sees
-- both. Rollback: re-run section 3 of 20260925120000.
-- =============================================================================

create or replace function public.friday_challenge_board(
  p_academy_id uuid,
  p_friday     date
)
returns table (
  name       text,
  kind       text,
  salawat    integer,
  kahf_pages integer,
  salawat_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_supervise(p_academy_id) then
    raise exception 'not_supervisor' using errcode = '42501';
  end if;

  return query
    select coalesce(
             case when s.id is not null then
               s.name || case when nullif(btrim(s.father_name), '-') is not null
                              then ' ' || btrim(s.father_name) else '' end
             end,
             t.name
           ) as name,
           case
             when s.id is not null then 'student'
             when t.roles && array['supervisor', 'admin']::text[] then 'supervisor'
             else 'teacher'
           end as kind,
           e.salawat, e.kahf_pages, e.salawat_at
      from public.friday_challenge_entries e
      left join public.students s on s.id = e.student_id
      left join public.teachers t on t.id = e.teacher_id
     where e.academy_id = p_academy_id
       and e.friday = p_friday
       and (e.salawat > 0 or e.kahf_pages > 0)
       and public.staff_sees_gender(p_academy_id, coalesce(s.gender_category, t.gender_category))
     order by e.salawat desc, e.salawat_at asc;
end
$$;
