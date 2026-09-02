alter table public.attendance_records
  alter column attendance_status set default 'present';


drop function if exists public.attendance_report(date, date, text, uuid, uuid, uuid);


drop function if exists public.attendance_report(date, date, text, uuid, uuid, uuid, text);


create function public.attendance_report(
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
   where public.is_admin()
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


create or replace function public.normalize_phone(txt text)
returns text
language sql
immutable
as $$
  select nullif(
           regexp_replace(

             regexp_replace(btrim(coalesce(txt, '')), '^00', ''),
             '[^0-9]', '', 'g'
           ),
           ''
         )
$$;


comment on function public.normalize_phone(text) is
  'Immutable digits-only phone key used for students.phone_key. Safe for indexes.';


alter table public.students
  add column if not exists phone_key text
    generated always as (public.normalize_phone(phone)) stored;


create index if not exists idx_students_phone_per_academy
  on public.students (academy_id, phone_key)
  where phone_key is not null;


drop trigger if exists trg_students_unique_phone on public.students;


drop function if exists public.enforce_unique_student_phone();


alter table public.students
  drop constraint if exists students_phone_required;


alter table public.students
  add constraint students_phone_required
    check (public.normalize_phone(phone) is not null) not valid;


alter table public.teachers
  add column if not exists phone text;


alter table public.teachers
  add column if not exists phone_key text
    generated always as (public.normalize_phone(phone)) stored;


create unique index if not exists uq_teachers_phone_per_academy
  on public.teachers (academy_id, phone_key)
  where phone_key is not null;


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

  when unique_violation then
    raise exception 'phone_taken' using errcode = '23505';
end
$$;


revoke execute on function public.register_teacher(uuid, text, text, text, text) from public;


grant  execute on function public.register_teacher(uuid, text, text, text, text) to anon, authenticated;


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


drop policy if exists teachers_select_self_or_admin on public.teachers;


create policy teachers_select_self_or_staff on public.teachers
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_staff());


drop policy if exists circles_select_own_or_admin on public.circles;


create policy circles_select_own_or_staff on public.circles
  for select to authenticated
  using (teacher_id = public.current_teacher_id() or public.is_staff());


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
   where public.is_staff()
     and ar.session_date between p_from and p_to
     and (p_gender      is null or s.gender_category = p_gender)
     and (p_circle_id   is null or c.id              = p_circle_id)
     and (p_teacher_id  is null or c.teacher_id      = p_teacher_id)
     and (p_academy_id  is null or c.academy_id      = p_academy_id)
     and (p_circle_type is null or c.type            = p_circle_type)
   group by s.id, s.name, s.father_name, s.gender_category
   order by 6 desc, 5 desc, s.name;
$$;


