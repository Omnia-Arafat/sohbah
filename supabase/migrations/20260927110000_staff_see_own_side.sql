-- Staff see only their own side.
--
-- The academy now runs men's circles beside the women's. A teacher or
-- supervisor may see only her own gender's students, teachers, circles and
-- everything recorded about them; an admin sees both. Students are anonymous
-- and read through their own SECURITY DEFINER functions, so none of this
-- touches them.
--
-- HOW: RESTRICTIVE select policies, TO authenticated only. A restrictive
-- policy is ANDed with the existing permissive ones, so no existing policy is
-- edited or dropped; each table gains one more condition for staff.
-- SECURITY DEFINER functions bypass RLS, so the three staff functions that
-- return names without a gender column are replaced with the same condition
-- added (bodies copied from 20260925120000 and 20260925140000). The four that
-- do return gender_category are filtered in the page (src/lib/viewer.ts).
--
-- NOT ADDITIVE IN EFFECT: no table or column changes and no rows move, but
-- what staff can read changes. On 2026-09-27 every teacher is female, so the
-- only visible difference today is that non-admin staff stop seeing the five
-- male students. Admins are unaffected. Rollback: drop the side_* policies.

begin;

-- True when the signed-in staff member may see something of this gender in
-- this academy: an admin always, anyone else only for her own gender. A null
-- gender belongs to neither side (a timetable board covering both).
create or replace function public.staff_sees_gender(p_academy_id uuid, p_gender text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_gender is null or exists (
    select 1 from public.teachers t
     where t.auth_user_id = auth.uid()
       and t.is_active
       and t.academy_id = p_academy_id
       and (t.role = 'admin'
            or 'admin' = any(t.roles)
            or t.gender_category = p_gender)
  )
$$;

create or replace function public.staff_sees_student(p_student_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select public.staff_sees_gender(s.academy_id, s.gender_category)
      from public.students s where s.id = p_student_id
  ), false)
$$;

create or replace function public.staff_sees_teacher(p_teacher_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select t.auth_user_id = auth.uid()
           or public.staff_sees_gender(t.academy_id, t.gender_category)
      from public.teachers t where t.id = p_teacher_id
  ), false)
$$;

create or replace function public.staff_sees_enrollment(p_enrollment_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select public.staff_sees_student(e.student_id)
      from public.track_enrollments e where e.id = p_enrollment_id
  ), false)
$$;

create or replace function public.staff_sees_circle(p_circle_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select public.staff_sees_gender(c.academy_id, c.gender_category)
      from public.circles c where c.id = p_circle_id
  ), false)
$$;

create or replace function public.staff_sees_attempt(p_attempt_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select public.staff_sees_student(a.student_id)
      from public.quiz_attempts a where a.id = p_attempt_id
  ), false)
$$;

revoke execute on function public.staff_sees_gender(uuid, text) from public;
grant  execute on function public.staff_sees_gender(uuid, text) to authenticated;
revoke execute on function public.staff_sees_student(uuid) from public;
grant  execute on function public.staff_sees_student(uuid) to authenticated;
revoke execute on function public.staff_sees_teacher(uuid) from public;
grant  execute on function public.staff_sees_teacher(uuid) to authenticated;
revoke execute on function public.staff_sees_enrollment(uuid) from public;
grant  execute on function public.staff_sees_enrollment(uuid) to authenticated;
revoke execute on function public.staff_sees_circle(uuid) from public;
grant  execute on function public.staff_sees_circle(uuid) to authenticated;
revoke execute on function public.staff_sees_attempt(uuid) from public;
grant  execute on function public.staff_sees_attempt(uuid) to authenticated;

-- The people and the circles themselves. Her own teacher row always, so a
-- deactivated account can still be told why it cannot work.
create policy side_students on public.students
  as restrictive for select to authenticated
  using (public.staff_sees_gender(academy_id, gender_category));

create policy side_teachers on public.teachers
  as restrictive for select to authenticated
  using (auth_user_id = auth.uid() or public.staff_sees_gender(academy_id, gender_category));

create policy side_circles on public.circles
  as restrictive for select to authenticated
  using (public.staff_sees_gender(academy_id, gender_category));

create policy side_schedule_boards on public.schedule_boards
  as restrictive for select to authenticated
  using (public.staff_sees_gender(academy_id, gender_category));

create policy side_track_cohorts on public.track_cohorts
  as restrictive for select to authenticated
  using (public.staff_sees_gender(academy_id, gender_category));

-- Everything recorded about a student follows the student.
create policy side_attendance_records on public.attendance_records
  as restrictive for select to authenticated
  using (public.staff_sees_student(student_id));

create policy side_track_enrollments on public.track_enrollments
  as restrictive for select to authenticated
  using (public.staff_sees_student(student_id));

create policy side_recitation_logs on public.recitation_logs
  as restrictive for select to authenticated
  using (public.staff_sees_student(student_id));

create policy side_quiz_attempts on public.quiz_attempts
  as restrictive for select to authenticated
  using (public.staff_sees_student(student_id));

create policy side_track_alerts on public.track_alerts
  as restrictive for select to authenticated
  using (public.staff_sees_student(student_id));

create policy side_track_day_reports on public.track_day_reports
  as restrictive for select to authenticated
  using (public.staff_sees_student(student_id));

create policy side_track_excuse_requests on public.track_excuse_requests
  as restrictive for select to authenticated
  using (public.staff_sees_student(student_id));

create policy side_track_recitations on public.track_recitations
  as restrictive for select to authenticated
  using (public.staff_sees_student(student_id));

create policy side_student_unit_progress on public.student_unit_progress
  as restrictive for select to authenticated
  using (public.staff_sees_student(student_id));

create policy side_track_absences on public.track_absences
  as restrictive for select to authenticated
  using (public.staff_sees_enrollment(enrollment_id));

create policy side_track_warnings on public.track_warnings
  as restrictive for select to authenticated
  using (public.staff_sees_enrollment(enrollment_id));

create policy side_track_meeting_scores on public.track_meeting_scores
  as restrictive for select to authenticated
  using (public.staff_sees_enrollment(enrollment_id));

create policy side_track_partners on public.track_partners
  as restrictive for select to authenticated
  using (public.staff_sees_enrollment(enrollment_id));

create policy side_circle_sessions on public.circle_sessions
  as restrictive for select to authenticated
  using (public.staff_sees_circle(circle_id));

create policy side_quiz_answers on public.quiz_answers
  as restrictive for select to authenticated
  using (public.staff_sees_attempt(attempt_id));

create policy side_friday_challenge_entries on public.friday_challenge_entries
  as restrictive for select to authenticated
  using (case when student_id is not null then public.staff_sees_student(student_id) else public.staff_sees_teacher(teacher_id) end);

-- The three staff functions that return names without a gender column.

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

create or replace function public.pending_excuses(p_academy_id uuid)
returns table (
  request_id    uuid,
  student_name  text,
  absence_date  date,
  reason        text,
  cohort_name   text,
  track_name    text,
  asked_at      timestamptz
)
language sql stable security definer set search_path = public
as $$
  select r.id, s.name,
         r.absence_date, r.reason, c.name_ar, t.name_ar, r.created_at
    from public.track_excuse_requests r
    join public.students s on s.id = r.student_id
    join public.track_enrollments e on e.id = r.enrollment_id
    join public.track_cohorts c on c.id = e.cohort_id
    join public.tracks t on t.id = c.track_id
   where c.academy_id = p_academy_id
     and r.status = 'pending'
     and public.staff_sees_gender(p_academy_id, s.gender_category)
     and exists (
       select 1 from public.teachers te
        where te.academy_id = p_academy_id
          and te.auth_user_id = auth.uid()
          and te.is_active
     )
   order by r.absence_date desc, r.created_at;
$$;

create or replace function public.cohort_day_reports(
  p_cohort_id uuid,
  p_date      date
)
returns table (
  enrollment_id uuid,
  student_name  text,
  partner_name  text,
  reported      boolean,
  recited_new    boolean,
  recited_review boolean,
  heard_recitation      boolean,
  prayed_with_memorised boolean
)
language sql stable security definer set search_path = public
as $$
  select e.id,
         s.name,
         coalesce(
           r.partner_name,
           (select coalesce(p.external_name, ps.name)
              from public.track_partners p
              left join public.track_enrollments pe on pe.id = p.partner_enrollment_id
              left join public.students ps on ps.id = pe.student_id
             where p.enrollment_id = e.id and p.active_to is null
             limit 1)
         ),
         r.id is not null,
         coalesce(r.recited_new, false),
         coalesce(r.recited_review, false),
         coalesce(r.heard_recitation, false),
         coalesce(r.prayed_with_memorised, false)
    from public.track_enrollments e
    join public.students s on s.id = e.student_id
    join public.track_cohorts c on c.id = e.cohort_id
    left join public.track_day_reports r
           on r.enrollment_id = e.id and r.session_date = p_date
   where e.cohort_id = p_cohort_id
     and public.staff_sees_gender(c.academy_id, c.gender_category)
     and e.status in ('active', 'warned')
     and exists (
       select 1 from public.teachers t
        where t.academy_id = c.academy_id
          and t.auth_user_id = auth.uid()
          and t.is_active
     )
   order by s.name;
$$;

revoke execute on function public.friday_challenge_board(uuid, date) from public;
grant  execute on function public.friday_challenge_board(uuid, date) to authenticated;
revoke execute on function public.pending_excuses(uuid) from public;
grant  execute on function public.pending_excuses(uuid) to authenticated;
revoke execute on function public.cohort_day_reports(uuid, date) from public;
grant  execute on function public.cohort_day_reports(uuid, date) to authenticated;

commit;
