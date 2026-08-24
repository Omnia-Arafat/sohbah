-- =============================================================================
-- Multi-Academy Support — Sohbah + Itqan
-- Adds academy table and foreign keys to enable multiple independent academies
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
  primary_color   text not null default '#2A8A66',
  accent_color    text not null default '#C4913A',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Enable RLS
alter table public.academies enable row level security;

-- Everyone can read active academies
create policy academies_select_active on public.academies
  for select to anon, authenticated using (is_active);

-- Only admins can modify
create policy academies_admin_all on public.academies
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2. Add academy_id to existing tables
alter table public.teachers add column academy_id uuid references public.academies(id) on delete cascade;
alter table public.circles add column academy_id uuid references public.academies(id) on delete cascade;
alter table public.students add column academy_id uuid references public.academies(id) on delete cascade;

-- 3. Create indexes
create index idx_teachers_academy on public.teachers (academy_id) where is_active;
create index idx_circles_academy on public.circles (academy_id) where is_active;
create index idx_students_academy on public.students (academy_id);

-- 4. Insert default academies
insert into public.academies (slug, name_ar, name_en, description_ar, description_en, logo_path, primary_color, accent_color)
values 
  ('itqan', 'مقراءة إتقان الإلكترونية', 'Itqan Online Recitation', 'برنامج مجاني لحفظ القرآن الكريم', 'Free Quran memorization program', '/brand/mark.svg', '#2A8A66', '#C4913A'),
  ('sohbah', 'مقراءة صحبة الإلكترونية', 'Sohbah Online Recitation', 'برنامج تعليمي متكامل', 'Comprehensive educational program', '/assets/logos/sohbah-logo.webp', '#4A5568', '#D97706');

-- 5. Update existing data to belong to Itqan academy
update public.teachers set academy_id = (select id from public.academies where slug = 'itqan');
update public.circles set academy_id = (select id from public.academies where slug = 'itqan');
update public.students set academy_id = (select id from public.academies where slug = 'itqan');

-- 6. Make academy_id required after backfill
alter table public.teachers alter column academy_id set not null;
alter table public.circles alter column academy_id set not null;
alter table public.students alter column academy_id set not null;

-- 7. Update gender match trigger to include academy check
create or replace function public.enforce_gender_match()
returns trigger
language plpgsql
as $$
declare
  v_circle_gender  text;
  v_student_gender text;
  v_circle_academy uuid;
  v_student_academy uuid;
begin
  select gender_category, academy_id into v_circle_gender, v_circle_academy 
    from public.circles where id = new.circle_id;
  select gender_category, academy_id into v_student_gender, v_student_academy 
    from public.students where id = new.student_id;

  if v_circle_academy is distinct from v_student_academy then
    raise exception 'academy_mismatch: student from different academy cannot join this circle' using errcode = '42501';
  end if;

  if v_circle_gender is distinct from v_student_gender then
    raise exception 'gender_mismatch: % student cannot join a % circle',
      v_student_gender, v_circle_gender using errcode = '42501';
  end if;
  
  return new;
end
$$;

-- 8. Update RLS policies to include academy filtering
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
         and c.teacher_id = public.current_teacher_id()
         and c.academy_id = students.academy_id
    )
  );

-- 9. Update public RPCs to include academy context

-- Get academy info by slug
create or replace function public.get_academy(p_slug text)
returns table (
  id uuid, slug text, name_ar text, name_en text,
  description_ar text, description_en text, logo_path text,
  primary_color text, accent_color text
)
language sql stable security definer set search_path = public
as $$
  select id, slug, name_ar, name_en, description_ar, description_en,
         logo_path, primary_color, accent_color
    from public.academies
   where slug = p_slug and is_active;
$$;

-- Update circle_public_info to include academy
-- Drop first because we're changing the return type
drop function if exists public.circle_public_info(text);

create function public.circle_public_info(p_slug text)
returns table (
  id uuid, name text, type text, gender_category text,
  session_link text, start_time time, timezone text,
  session_date date, meets_today boolean, academy_id uuid
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

-- Update search_students to respect academy
-- No need to drop - not changing return type
create or replace function public.search_students(p_slug text, p_query text)
returns table (id uuid, name text, father_name text)
language sql stable security definer set search_path = public, extensions
as $$
  select s.id, s.name, s.father_name
    from public.students s
    join public.circles c on c.registration_slug = p_slug and c.is_active
   where char_length(btrim(p_query)) >= 2
     and s.gender_category = c.gender_category
     and s.academy_id = c.academy_id
     and s.search_key like '%' || public.normalize_ar(btrim(p_query)) || '%'
   order by extensions.similarity(s.search_key, public.normalize_ar(btrim(p_query))) desc,
            s.name
   limit 10;
$$;

-- Update find_similar_students to include academy
-- Drop first because we're adding a parameter
drop function if exists public.find_similar_students(text, text, text);

create function public.find_similar_students(
  p_name text, p_father_name text, p_gender text, p_academy_id uuid
)
returns table (id uuid, name text, father_name text)
language sql stable security definer set search_path = public
as $$
  select s.id, s.name, s.father_name
    from public.students s
   where s.gender_category = p_gender
     and s.academy_id = p_academy_id
     and s.search_key = public.normalize_ar(p_name || ' ' || p_father_name)
   limit 5;
$$;

-- Update teacher_today_circles to filter by academy
-- Drop first because we're changing the return type
drop function if exists public.teacher_today_circles();

create function public.teacher_today_circles()
returns table (
  id uuid, name text, type text, gender_category text,
  start_time time, timezone text, registration_slug text,
  session_date date, joined_count bigint, academy_id uuid
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
      on ar.circle_id = c.id
     and ar.session_date = (now() at time zone c.timezone)::date
   where c.is_active
     and (c.teacher_id = public.current_teacher_id() or public.is_admin())
     and extract(dow from (now() at time zone c.timezone)::date)::smallint = any(c.days_of_week)
   group by c.id
   order by c.start_time;
$$;

-- 10. Grant execute permissions
revoke execute on function public.get_academy(text) from public;
grant execute on function public.get_academy(text) to anon, authenticated;

-- Update attendance report to include academy filtering
-- Drop first because we're adding a parameter
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
   where public.is_admin()
     and ar.session_date between p_from and p_to
     and (p_gender     is null or s.gender_category = p_gender)
     and (p_circle_id  is null or c.id              = p_circle_id)
     and (p_teacher_id is null or c.teacher_id      = p_teacher_id)
     and (p_academy_id is null or c.academy_id      = p_academy_id)
   group by s.id, s.name, s.father_name, s.gender_category
   order by 5 desc, 8 desc, s.name;
$$;

comment on table public.academies is 'Multi-tenant support for different academies (Itqan, Sohbah, etc.)';
