-- =============================================================================
-- Sohbah Academy — Single-tenant academy support
-- Adds the academies table and academy_id foreign keys.
-- Sohbah is the only academy; no backfill needed on a fresh database.
-- =============================================================================

-- 1. Create academies table
create table public.academies (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name_ar         text not null,
  name_en         text not null,
  description_ar  text,
  description_en  text,
  logo_path       text,
  primary_color   text not null default '#4A5568',
  accent_color    text not null default '#D97706',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Enable RLS
alter table public.academies enable row level security;

-- Everyone can read active academies (needed by the app layout to load branding)
create policy academies_select_active on public.academies
  for select to anon, authenticated using (is_active);

-- Only admins can modify academy rows
create policy academies_admin_all on public.academies
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2. Add academy_id foreign key to the three tenant tables
alter table public.teachers add column academy_id uuid references public.academies(id) on delete cascade;
alter table public.circles  add column academy_id uuid references public.academies(id) on delete cascade;
alter table public.students add column academy_id uuid references public.academies(id) on delete cascade;

-- 3. Indexes
create index idx_teachers_academy on public.teachers (academy_id) where is_active;
create index idx_circles_academy  on public.circles  (academy_id) where is_active;
create index idx_students_academy on public.students (academy_id);

-- 4. Seed Sohbah as the single academy
insert into public.academies (
  slug, name_ar, name_en,
  description_ar, description_en,
  logo_path, primary_color, accent_color
)
values (
  'sohbah',
  'مقراءة صحبة الإلكترونية',
  'Sohbah Online Recitation',
  'برنامج تعليمي متكامل',
  'Comprehensive educational program',
  '/assets/logos/sohbah-logo.webp',
  '#4A5568',
  '#D97706'
);

-- 5. Enforce academy_id as required.
--    On a fresh database there are no existing rows, so no backfill is needed.
alter table public.teachers alter column academy_id set not null;
alter table public.circles  alter column academy_id set not null;
alter table public.students alter column academy_id set not null;

-- 6. Strengthen the gender trigger to also enforce academy isolation
create or replace function public.enforce_gender_match()
returns trigger
language plpgsql
as $$
declare
  v_circle_gender   text;
  v_student_gender  text;
  v_circle_academy  uuid;
  v_student_academy uuid;
begin
  select gender_category, academy_id
    into v_circle_gender, v_circle_academy
    from public.circles where id = new.circle_id;

  select gender_category, academy_id
    into v_student_gender, v_student_academy
    from public.students where id = new.student_id;

  if v_circle_academy is distinct from v_student_academy then
    raise exception 'academy_mismatch: student from different academy cannot join this circle'
      using errcode = '42501';
  end if;

  if v_circle_gender is distinct from v_student_gender then
    raise exception 'gender_mismatch: % student cannot join a % circle',
      v_student_gender, v_circle_gender using errcode = '42501';
  end if;

  return new;
end
$$;

-- 7. Update RLS policy for students to include academy_id in the join check
drop policy if exists students_select_own_circles on public.students;
create policy students_select_own_circles on public.students
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
        from public.attendance_records ar
        join public.circles c on c.id = ar.circle_id
       where ar.student_id = students.id
         and c.teacher_id  = public.current_teacher_id()
         and c.academy_id  = students.academy_id
    )
  );

-- =============================================================================
-- 8. Rebuild RPCs that need academy_id awareness
-- =============================================================================

-- 8.1 get_academy — returns branding for a given slug
create or replace function public.get_academy(p_slug text)
returns table (
  id             uuid,
  slug           text,
  name_ar        text,
  name_en        text,
  description_ar text,
  description_en text,
  logo_path      text,
  primary_color  text,
  accent_color   text
)
language sql stable security definer set search_path = public
as $$
  select id, slug, name_ar, name_en, description_ar, description_en,
         logo_path, primary_color, accent_color
    from public.academies
   where slug = p_slug and is_active;
$$;

-- 8.2 circle_public_info — add academy_id to return type (drop required: return type changed)
drop function if exists public.circle_public_info(text);

create function public.circle_public_info(p_slug text)
returns table (
  id              uuid,
  name            text,
  type            text,
  gender_category text,
  session_link    text,
  start_time      time,
  timezone        text,
  session_date    date,
  meets_today     boolean,
  academy_id      uuid
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.type, c.gender_category,
         c.session_link, c.start_time, c.timezone,
         (now() at time zone c.timezone)::date,
         extract(dow from (now() at time zone c.timezone)::date)::smallint = any(c.days_of_week),
         c.academy_id
    from public.circles c
   where c.registration_slug = p_slug and c.is_active;
$$;

-- 8.3 search_students — scope results to the circle's academy
create or replace function public.search_students(p_slug text, p_query text)
returns table (id uuid, name text, father_name text)
language sql stable security definer set search_path = public, extensions
as $$
  select s.id, s.name, s.father_name
    from public.students s
    join public.circles c on c.registration_slug = p_slug and c.is_active
   where char_length(btrim(p_query)) >= 2
     and s.gender_category = c.gender_category
     and s.academy_id      = c.academy_id
     and s.search_key like '%' || public.normalize_ar(btrim(p_query)) || '%'
   order by extensions.similarity(s.search_key, public.normalize_ar(btrim(p_query))) desc,
            s.name
   limit 10;
$$;

-- 8.4 find_similar_students — add p_academy_id param (drop required: signature changed)
drop function if exists public.find_similar_students(text, text, text);

create function public.find_similar_students(
  p_name        text,
  p_father_name text,
  p_gender      text,
  p_academy_id  uuid
)
returns table (id uuid, name text, father_name text)
language sql stable security definer set search_path = public
as $$
  select s.id, s.name, s.father_name
    from public.students s
   where s.gender_category = p_gender
     and s.academy_id      = p_academy_id
     and s.search_key = public.normalize_ar(p_name || ' ' || p_father_name)
   limit 5;
$$;

-- 8.5 teacher_today_circles — add academy_id to return type (drop required: return type changed)
drop function if exists public.teacher_today_circles();

create function public.teacher_today_circles()
returns table (
  id                uuid,
  name              text,
  type              text,
  gender_category   text,
  start_time        time,
  timezone          text,
  registration_slug text,
  session_date      date,
  joined_count      bigint,
  academy_id        uuid
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.type, c.gender_category,
         c.start_time, c.timezone, c.registration_slug,
         (now() at time zone c.timezone)::date,
         count(ar.id),
         c.academy_id
    from public.circles c
    left join public.attendance_records ar
      on ar.circle_id    = c.id
     and ar.session_date = (now() at time zone c.timezone)::date
   where c.is_active
     and (c.teacher_id = public.current_teacher_id() or public.is_admin())
     and extract(dow from (now() at time zone c.timezone)::date)::smallint = any(c.days_of_week)
   group by c.id
   order by c.start_time;
$$;

-- 8.6 attendance_report — add optional p_academy_id filter (drop required: signature changed)
drop function if exists public.attendance_report(date, date, text, uuid, uuid);

create function public.attendance_report(
  p_from       date,
  p_to         date,
  p_gender     text default null,
  p_circle_id  uuid default null,
  p_teacher_id uuid default null,
  p_academy_id uuid default null
)
returns table (
  student_id        uuid,
  student_name      text,
  father_name       text,
  gender_category   text,
  sessions_present  bigint,
  sessions_absent   bigint,
  sessions_unmarked bigint,
  sessions_joined   bigint
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
   where public.is_admin()
     and ar.session_date between p_from and p_to
     and (p_gender     is null or s.gender_category = p_gender)
     and (p_circle_id  is null or c.id              = p_circle_id)
     and (p_teacher_id is null or c.teacher_id      = p_teacher_id)
     and (p_academy_id is null or c.academy_id      = p_academy_id)
   group by s.id, s.name, s.father_name, s.gender_category
   order by 5 desc, 8 desc, s.name;
$$;

-- =============================================================================
-- 9. Grants
--    drop+create resets any existing grants — re-grant explicitly.
-- =============================================================================

-- get_academy (new) — public read, no auth required
revoke execute on function public.get_academy(text) from public;
grant  execute on function public.get_academy(text) to anon, authenticated;

-- circle_public_info (rebuilt — return type changed)
revoke execute on function public.circle_public_info(text) from public;
grant  execute on function public.circle_public_info(text) to anon, authenticated;

-- find_similar_students (rebuilt — now 4 params)
revoke execute on function public.find_similar_students(text, text, text, uuid) from public;
grant  execute on function public.find_similar_students(text, text, text, uuid) to anon, authenticated;

-- teacher_today_circles (rebuilt — return type changed)
-- anon was revoked in 20260804153000; re-apply since drop+create resets grants
revoke execute on function public.teacher_today_circles() from anon;
grant  execute on function public.teacher_today_circles() to authenticated;

-- attendance_report (rebuilt — now 6 params)
-- anon was revoked in 20260804153000; re-apply since drop+create resets grants
revoke execute on function public.attendance_report(date, date, text, uuid, uuid, uuid) from anon;
grant  execute on function public.attendance_report(date, date, text, uuid, uuid, uuid) to authenticated;

comment on table public.academies is 'Single-tenant: Sohbah Academy only.';
