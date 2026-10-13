-- The tracks report's two reads of tables staff cannot select from directly.
--
-- track_day_reports and track_excuse_requests have every privilege revoked
-- from anon and authenticated (20260925100000_track_day_report.sql); staff
-- read them only through security-definer functions such as
-- cohort_day_reports(). The tracks report read them with a plain select and
-- was refused, so it showed «تعذّر تحميل جزء من بيانات المسارات».
--
-- These two functions give the report the same rows, under the same rule the
-- day board uses: an active member of staff of the cohort's academy, and only
-- for the side (gender) she is allowed to see.
--
-- ADDITIVE ONLY: two new functions. No table, policy or existing function
-- changes.
--
-- Rollback:
--   drop function if exists public.track_report_cards(uuid[], date, date);
--   drop function if exists public.track_report_pending_excuses(uuid[], date, date);

begin;

create or replace function public.track_report_cards(
  p_enrollment_ids uuid[],
  p_from date,
  p_to   date
)
returns table (
  enrollment_id  uuid,
  session_date   date,
  recited_new    boolean,
  recited_review boolean
)
language sql stable security definer set search_path = public
as $$
  select r.enrollment_id, r.session_date, r.recited_new, r.recited_review
    from public.track_day_reports r
    join public.track_enrollments e on e.id = r.enrollment_id
    join public.track_cohorts c on c.id = e.cohort_id
   where r.enrollment_id = any(p_enrollment_ids)
     and r.session_date between p_from and p_to
     and public.staff_sees_gender(c.academy_id, c.gender_category)
     and exists (
       select 1 from public.teachers t
        where t.academy_id = c.academy_id
          and t.auth_user_id = auth.uid()
          and t.is_active
     );
$$;

revoke execute on function public.track_report_cards(uuid[], date, date) from public;
grant  execute on function public.track_report_cards(uuid[], date, date) to authenticated;

create or replace function public.track_report_pending_excuses(
  p_enrollment_ids uuid[],
  p_from date,
  p_to   date
)
returns table (
  enrollment_id uuid,
  absence_date  date
)
language sql stable security definer set search_path = public
as $$
  select x.enrollment_id, x.absence_date
    from public.track_excuse_requests x
    join public.track_enrollments e on e.id = x.enrollment_id
    join public.track_cohorts c on c.id = e.cohort_id
   where x.enrollment_id = any(p_enrollment_ids)
     and x.status = 'pending'
     and x.absence_date between p_from and p_to
     and public.staff_sees_gender(c.academy_id, c.gender_category)
     and exists (
       select 1 from public.teachers t
        where t.academy_id = c.academy_id
          and t.auth_user_id = auth.uid()
          and t.is_active
     );
$$;

revoke execute on function public.track_report_pending_excuses(uuid[], date, date) from public;
grant  execute on function public.track_report_pending_excuses(uuid[], date, date) to authenticated;

commit;
