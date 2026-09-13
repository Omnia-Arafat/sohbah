-- A مشرفة could not reach the circles she supervises.
--
-- Reported today: "المشرفات لا عارفين يديروا الحلقات ولا يتابعوا أدوار الطلبة
-- أثناء التسميع ويغيروا الحالة بتاعتهم".
--
-- Every policy that governs *acting* on a circle was widened for supervisors
-- when the role arrived in 20260904140000 — `circles_update_own_or_supervisor`,
-- `attendance_update_owner_or_supervisor`, its delete twin, and
-- `reorder_queue()`. All of them are correct, which is why this reads as a
-- permissions failure from the outside and is invisible in the policies: she
-- could change a student's status all along, she just had no way to open the
-- session.
--
-- `teacher_today_circles()` fills «حلقات اليوم», the section she starts her day
-- on, and it still asks `is_admin()`. It predates the supervisor role by three
-- weeks (20260810) and was never revisited. A مشرفة holds
-- roles = {teacher,supervisor}, so `is_admin()` is false for her, and she keeps
-- only the `teacher_id = me` branch — but supervising is most of her job and
-- teaching is little of it, so the list comes back empty and there is no
-- «إدارة الجلسة» button anywhere on the screen.
--
-- Measured against production on 2026-09-13: five of the six supervisors get an
-- empty list while seven circles are running.
--
-- `can_supervise()` matches roles && {supervisor,admin}, so an admin keeps
-- exactly what she had. It also takes an academy id, which `is_admin()` does
-- not — two academies share these tables, and an admin of the other one has
-- been able to see this one's circles here. Scoping per row closes that too.
--
-- Deliberately NOT touched: `attendance_report()`. It looks like the same bug
-- and is not — 20260830170000 already moved it to `is_staff()`, so every
-- approved معلمة and مشرفة gets the report. Verified against the live
-- definition before writing this; an earlier draft of this migration would have
-- narrowed it to supervisors and, with the older 7-arg signature, left a second
-- overload beside the live `p_teacher_ids uuid[]` one.
--
-- `create or replace`: signature and return type are unchanged, so the existing
-- grants carry over and nothing needs re-granting.

create or replace function public.teacher_today_circles()
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
     and (c.teacher_id = public.current_teacher_id()
          or public.can_supervise(c.academy_id))
     and extract(dow from (now() at time zone c.timezone)::date)::smallint = any(c.days_of_week)
   group by c.id
   order by c.start_time;
$$;

comment on function public.teacher_today_circles() is
  'Today''s circles: a معلمة''s own, or every circle in the academy for a مشرفة or admin.';
