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
