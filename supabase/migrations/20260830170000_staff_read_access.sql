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
