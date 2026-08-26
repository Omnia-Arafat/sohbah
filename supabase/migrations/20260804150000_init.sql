-- =============================================================================
-- Sohbah Academy — MVP schema (v2)
-- Target: Supabase / PostgreSQL 15+
--
-- Changes vs. the v1 draft in the original brief:
--   * circles are recurring (timezone + start_time + days_of_week), not one-off
--   * session_date is computed in the circle's local timezone, never UTC current_date
--   * queue_order is assigned server-side under a lock; reorder is a dedicated RPC
--   * Arabic-aware name search (pg_trgm over a normalized key), not full-text
--   * teachers.role distinguishes admin from teacher
--   * gender separation enforced by trigger + RPC, not only by app queries
--   * students table is NOT publicly readable; all public access goes through RPCs
--   * small_groups omitted — Phase 2
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- =============================================================================
-- 1. Arabic text normalization
-- Folds hamza forms, alef maqsura, ta marbuta; strips tashkeel and tatweel, so
-- "أحمد" / "احمد" / "أَحْمَد" all collapse to the same search key.
-- =============================================================================

create or replace function public.normalize_ar(txt text)
returns text
language sql
immutable
strict
as $$
  select btrim(
           regexp_replace(
             lower(
               translate(
                 -- fold: alef forms -> ا, alef maqsura -> ي, ta marbuta -> ه,
                 --       waw/ya hamza -> و/ي
                 translate(txt, 'أإآٱىةؤئ', 'اااايهوي'),
                 -- delete: fathatan..sukun, superscript alef, tatweel
                 'ًٌٍَُِّْٰـ', ''
               )
             ),
             '\s+', ' ', 'g'
           )
         )
$$;

comment on function public.normalize_ar(text) is
  'Immutable Arabic normalization used to build students.search_key. Safe for indexes.';

-- =============================================================================
-- 2. Teachers (and admins — same table, distinguished by role)
-- =============================================================================

create table public.teachers (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique references auth.users(id) on delete set null,
  name            text not null,
  gender_category text not null check (gender_category in ('male', 'female')),
  role            text not null default 'teacher' check (role in ('teacher', 'admin')),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- =============================================================================
-- 3. Students — one permanent record per person, created once
-- =============================================================================

create table public.students (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (btrim(name) <> ''),
  father_name     text not null check (btrim(father_name) <> ''),
  phone           text,                                    -- optional
  gender_category text not null check (gender_category in ('male', 'female')),
  search_key      text generated always as
                    (public.normalize_ar(name || ' ' || father_name)) stored,
  created_at      timestamptz not null default now()
);

-- Substring + fuzzy autocomplete. GIN/trgm serves `search_key LIKE '%x%'`.
create index idx_students_search_key
  on public.students using gin (search_key extensions.gin_trgm_ops);

-- Backs the "this student may already be registered" warning at registration.
create index idx_students_dupe_lookup
  on public.students (gender_category, search_key);

-- =============================================================================
-- 4. Circles — recurring by design
-- days_of_week uses PostgreSQL's dow convention: 0 = Sunday .. 6 = Saturday.
-- =============================================================================

create table public.circles (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references public.teachers(id) on delete cascade,
  name              text not null,
  type              text not null check (type in ('tasheeh', 'tajweed', 'free_recitation')),
  gender_category   text not null check (gender_category in ('male', 'female')),
  session_link      text not null,
  timezone          text not null default 'Asia/Riyadh',
  start_time        time not null,
  duration_minutes  int not null default 60 check (duration_minutes between 5 and 480),
  days_of_week      smallint[] not null default '{0,1,2,3,4,5,6}'::smallint[]
                      check (days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]
                             and array_length(days_of_week, 1) between 1 and 7),
  registration_slug text not null unique,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create index idx_circles_teacher on public.circles (teacher_id) where is_active;

-- An invalid timezone silently corrupts every session_date, so reject it up front.
create or replace function public.validate_circle_timezone()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end
$$;

create trigger trg_circles_validate_timezone
  before insert or update of timezone on public.circles
  for each row execute function public.validate_circle_timezone();

-- =============================================================================
-- 5. Attendance records — one row per (student, circle, session day)
-- =============================================================================

create table public.attendance_records (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students(id) on delete cascade,
  circle_id         uuid not null references public.circles(id) on delete cascade,
  -- NOTE: no default. Always set by join_circle() in the circle's local timezone.
  session_date      date not null,
  queue_order       int not null check (queue_order > 0),
  joined_at         timestamptz not null default now(),
  attendance_status text not null default 'pending'
                      check (attendance_status in ('pending', 'present', 'absent')),
  recitation_status text not null default 'waiting'
                      check (recitation_status in ('waiting', 'reciting', 'done')),
  created_at        timestamptz not null default now(),
  constraint uq_attendance_student_session
    unique (student_id, circle_id, session_date),
  -- Deferrable so reorder_queue() can permute positions inside one transaction.
  constraint uq_attendance_queue_position
    unique (circle_id, session_date, queue_order) deferrable initially deferred
);

create index idx_attendance_circle_date  on public.attendance_records (circle_id, session_date);
create index idx_attendance_student_date on public.attendance_records (student_id, session_date);
create index idx_attendance_session_date on public.attendance_records (session_date);

-- Hard guarantee of male/female separation, independent of app-side filtering.
create or replace function public.enforce_gender_match()
returns trigger
language plpgsql
as $$
declare
  v_circle_gender  text;
  v_student_gender text;
begin
  select gender_category into v_circle_gender  from public.circles  where id = new.circle_id;
  select gender_category into v_student_gender from public.students where id = new.student_id;

  if v_circle_gender is distinct from v_student_gender then
    raise exception 'gender_mismatch: % student cannot join a % circle',
      v_student_gender, v_circle_gender using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger trg_attendance_gender_match
  before insert or update of student_id, circle_id on public.attendance_records
  for each row execute function public.enforce_gender_match();

-- =============================================================================
-- 6. Auth helpers
-- =============================================================================

create or replace function public.current_teacher_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.teachers where auth_user_id = auth.uid() and is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teachers
     where auth_user_id = auth.uid() and role = 'admin' and is_active
  )
$$;

-- =============================================================================
-- 7. Row Level Security
--
-- Model: students and teachers never share a trust boundary.
--   * Students are anonymous. They touch the DB only through SECURITY DEFINER
--     RPCs keyed by a circle's registration_slug — the slug is the credential.
--   * Teachers/admins are authenticated and read/write their own rows directly.
--   * attendance_records is publicly SELECTable because it holds no PII (uuids
--     and statuses only) and Realtime needs a SELECT policy to deliver events.
-- =============================================================================

alter table public.teachers           enable row level security;
alter table public.students           enable row level security;
alter table public.circles            enable row level security;
alter table public.attendance_records enable row level security;

-- --- teachers ---------------------------------------------------------------
create policy teachers_select_self_or_admin on public.teachers
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_admin());

create policy teachers_update_self_or_admin on public.teachers
  for update to authenticated
  using (auth_user_id = auth.uid() or public.is_admin())
  with check (auth_user_id = auth.uid() or public.is_admin());

create policy teachers_admin_insert on public.teachers
  for insert to authenticated with check (public.is_admin());

create policy teachers_admin_delete on public.teachers
  for delete to authenticated using (public.is_admin());

-- --- students ---------------------------------------------------------------
-- Public registration (4.1). No public SELECT: search goes through search_students().
create policy students_public_insert on public.students
  for insert to anon, authenticated with check (true);

-- A teacher may read only students who appear in one of their own circles.
create policy students_select_own_circles on public.students
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
        from public.attendance_records ar
        join public.circles c on c.id = ar.circle_id
       where ar.student_id = students.id
         and c.teacher_id = public.current_teacher_id()
    )
  );

create policy students_admin_update on public.students
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy students_admin_delete on public.students
  for delete to authenticated using (public.is_admin());

-- --- circles ----------------------------------------------------------------
-- No anon SELECT: the session_link is behind circle_public_info(slug).
create policy circles_select_own_or_admin on public.circles
  for select to authenticated
  using (teacher_id = public.current_teacher_id() or public.is_admin());

create policy circles_insert_own on public.circles
  for insert to authenticated
  with check (teacher_id = public.current_teacher_id() or public.is_admin());

create policy circles_update_own_or_admin on public.circles
  for update to authenticated
  using (teacher_id = public.current_teacher_id() or public.is_admin())
  with check (teacher_id = public.current_teacher_id() or public.is_admin());

create policy circles_delete_own_or_admin on public.circles
  for delete to authenticated
  using (teacher_id = public.current_teacher_id() or public.is_admin());

-- --- attendance_records -----------------------------------------------------
-- SELECT open (no PII, required by Realtime). INSERT only via join_circle().
create policy attendance_select_all on public.attendance_records
  for select to anon, authenticated using (true);

create policy attendance_update_owner on public.attendance_records
  for update to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.circles c
                where c.id = attendance_records.circle_id
                  and c.teacher_id = public.current_teacher_id())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.circles c
                where c.id = attendance_records.circle_id
                  and c.teacher_id = public.current_teacher_id())
  );

create policy attendance_delete_owner on public.attendance_records
  for delete to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.circles c
                where c.id = attendance_records.circle_id
                  and c.teacher_id = public.current_teacher_id())
  );

-- =============================================================================
-- 8. Public RPCs (students — no login, slug is the credential)
-- =============================================================================

-- 8.1 Circle header: name, link, and today's session date. (Feature 4.7)
create or replace function public.circle_public_info(p_slug text)
returns table (
  id uuid, name text, type text, gender_category text,
  session_link text, start_time time, timezone text,
  session_date date, meets_today boolean
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.type, c.gender_category,
         c.session_link, c.start_time, c.timezone,
         (now() at time zone c.timezone)::date,
         extract(dow from (now() at time zone c.timezone)::date)::smallint = any(c.days_of_week)
    from public.circles c
   where c.registration_slug = p_slug and c.is_active;
$$;

-- 8.2 Autocomplete. Returns name + father's name only — never phone. (Feature 4.3)
create or replace function public.search_students(p_slug text, p_query text)
returns table (id uuid, name text, father_name text)
language sql stable security definer set search_path = public, extensions
as $$
  select s.id, s.name, s.father_name
    from public.students s
    join public.circles c on c.registration_slug = p_slug and c.is_active
   where char_length(btrim(p_query)) >= 2
     and s.gender_category = c.gender_category          -- male/female separation
     and s.search_key like '%' || public.normalize_ar(btrim(p_query)) || '%'
   order by extensions.similarity(s.search_key, public.normalize_ar(btrim(p_query))) desc,
            s.name
   limit 10;
$$;

-- 8.3 Duplicate warning at registration. (Risk 2)
create or replace function public.find_similar_students(
  p_name text, p_father_name text, p_gender text
)
returns table (id uuid, name text, father_name text)
language sql stable security definer set search_path = public
as $$
  select s.id, s.name, s.father_name
    from public.students s
   where s.gender_category = p_gender
     and s.search_key = public.normalize_ar(p_name || ' ' || p_father_name)
   limit 5;
$$;

-- 8.4 Join the queue. Assigns queue_order server-side, idempotent per day.
create or replace function public.join_circle(p_slug text, p_student_id uuid)
returns table (attendance_id uuid, session_date date, queue_order int, already_joined boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_circle  public.circles%rowtype;
  v_student public.students%rowtype;
  v_date    date;
  v_row     public.attendance_records%rowtype;
  v_next    int;
begin
  select * into v_circle from public.circles
   where registration_slug = p_slug and is_active;
  if not found then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  if v_student.gender_category is distinct from v_circle.gender_category then
    raise exception 'gender_mismatch' using errcode = '42501';
  end if;

  v_date := (now() at time zone v_circle.timezone)::date;

  select * into v_row
    from public.attendance_records ar
   where ar.student_id = p_student_id
     and ar.circle_id = v_circle.id
     and ar.session_date = v_date;

  if found then
    return query select v_row.id, v_row.session_date, v_row.queue_order, true;
    return;
  end if;

  -- Serialize position assignment per circle+day so simultaneous joins at the
  -- start of a session cannot collide on queue_order.
  perform pg_advisory_xact_lock(hashtext(v_circle.id::text || v_date::text));

  select coalesce(max(ar.queue_order), 0) + 1 into v_next
    from public.attendance_records ar
   where ar.circle_id = v_circle.id and ar.session_date = v_date;

  insert into public.attendance_records (student_id, circle_id, session_date, queue_order)
  values (p_student_id, v_circle.id, v_date, v_next)
  returning * into v_row;

  return query select v_row.id, v_row.session_date, v_row.queue_order, false;
end
$$;

-- 8.5 Today's queue for a circle, with names. (Features 4.4, 4.6)
create or replace function public.circle_queue(p_slug text)
returns table (
  attendance_id uuid, student_id uuid, name text, father_name text,
  queue_order int, attendance_status text, recitation_status text, joined_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select ar.id, s.id, s.name, s.father_name,
         ar.queue_order, ar.attendance_status, ar.recitation_status, ar.joined_at
    from public.circles c
    join public.attendance_records ar
      on ar.circle_id = c.id
     and ar.session_date = (now() at time zone c.timezone)::date
    join public.students s on s.id = ar.student_id
   where c.registration_slug = p_slug and c.is_active
   order by ar.queue_order;
$$;

-- =============================================================================
-- 9. Teacher / admin RPCs (authenticated)
-- =============================================================================

-- 9.1 Teacher dashboard: circles that actually meet today. (Feature 4.9)
create or replace function public.teacher_today_circles()
returns table (
  id uuid, name text, type text, gender_category text,
  start_time time, timezone text, registration_slug text,
  session_date date, joined_count bigint
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.type, c.gender_category,
         c.start_time, c.timezone, c.registration_slug,
         (now() at time zone c.timezone)::date,
         count(ar.id)
    from public.circles c
    left join public.attendance_records ar
      on ar.circle_id = c.id
     and ar.session_date = (now() at time zone c.timezone)::date
   where c.is_active
     and (c.teacher_id = public.current_teacher_id() or public.is_admin())
     and extract(dow from (now() at time zone c.timezone)::date)::smallint = any(c.days_of_week)
   group by c.id
   order by c.start_time;
$$;

-- 9.2 Manual queue reorder. (Feature 4.4)
create or replace function public.reorder_queue(
  p_circle_id uuid, p_session_date date, p_student_ids uuid[]
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (
    public.is_admin()
    or exists (select 1 from public.circles c
                where c.id = p_circle_id and c.teacher_id = public.current_teacher_id())
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.attendance_records ar
     set queue_order = u.ord
    from unnest(p_student_ids) with ordinality as u(sid, ord)
   where ar.circle_id = p_circle_id
     and ar.session_date = p_session_date
     and ar.student_id = u.sid;
end
$$;

-- 9.3 Attendance ranking report. (Feature 4.8)
-- "Attended" counts attendance_status = 'present' only. Rows the teacher never
-- marked stay 'pending' and are reported separately so undercounting is visible.
create or replace function public.attendance_report(
  p_from       date,
  p_to         date,
  p_gender     text default null,
  p_circle_id  uuid default null,
  p_teacher_id uuid default null
)
returns table (
  student_id uuid, student_name text, father_name text, gender_category text,
  sessions_present bigint, sessions_absent bigint, sessions_unmarked bigint, sessions_joined bigint
)
language sql stable security definer set search_path = public
as $$
  select s.id, s.name, s.father_name, s.gender_category,
         count(*) filter (where ar.attendance_status = 'present'),
         count(*) filter (where ar.attendance_status = 'absent'),
         count(*) filter (where ar.attendance_status = 'pending'),
         count(*)
    from public.attendance_records ar
    join public.students s on s.id = ar.student_id
    join public.circles  c on c.id = ar.circle_id
   where public.is_admin()                      -- non-admins get an empty result
     and ar.session_date between p_from and p_to
     and (p_gender     is null or s.gender_category = p_gender)
     and (p_circle_id  is null or c.id              = p_circle_id)
     and (p_teacher_id is null or c.teacher_id      = p_teacher_id)
   group by s.id, s.name, s.father_name, s.gender_category
   order by 5 desc, 8 desc, s.name;
$$;

-- =============================================================================
-- 10. Function grants — deny by default, then allow explicitly
-- =============================================================================

revoke execute on function public.circle_public_info(text)                     from public;
revoke execute on function public.search_students(text, text)                  from public;
revoke execute on function public.find_similar_students(text, text, text)      from public;
revoke execute on function public.join_circle(text, uuid)                      from public;
revoke execute on function public.circle_queue(text)                           from public;
revoke execute on function public.teacher_today_circles()                      from public;
revoke execute on function public.reorder_queue(uuid, date, uuid[])            from public;
revoke execute on function public.attendance_report(date, date, text, uuid, uuid) from public;

grant execute on function public.circle_public_info(text)                to anon, authenticated;
grant execute on function public.search_students(text, text)             to anon, authenticated;
grant execute on function public.find_similar_students(text, text, text) to anon, authenticated;
grant execute on function public.join_circle(text, uuid)                 to anon, authenticated;
grant execute on function public.circle_queue(text)                      to anon, authenticated;

grant execute on function public.teacher_today_circles()                 to authenticated;
grant execute on function public.reorder_queue(uuid, date, uuid[])       to authenticated;
grant execute on function public.attendance_report(date, date, text, uuid, uuid) to authenticated;

-- =============================================================================
-- 11. Realtime
-- The queue list subscribes to attendance_records and refetches circle_queue()
-- on each event (the payload itself carries no student names).
-- =============================================================================

do $$
begin
  alter publication supabase_realtime add table public.attendance_records;
exception
  when duplicate_object then null;
end
$$;
