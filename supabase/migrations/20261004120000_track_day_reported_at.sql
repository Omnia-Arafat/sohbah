-- The time on بطاقة التتميم.
--
-- The card is becoming a picture that carries the date and the time she
-- reported the day, and names her cohort's معلمة and how long the track runs.
-- The date was always there (session_date); the time is
-- track_day_reports.updated_at, which my_track_week did not return. It now
-- does, as `reported_at` (null for a day with no report), followed by
-- `teacher_name` (null until a معلمة is assigned) and `duration_weeks`.
--
-- A function's result columns cannot change under CREATE OR REPLACE, so it is
-- dropped and created again inside one transaction: no caller ever finds it
-- missing. Existing callers read columns by name and are unaffected by the
-- new ones. The body is otherwise exactly 20260925100000_track_day_report.sql's.

begin;

drop function if exists public.my_track_week(uuid, text);

create function public.my_track_week(
  p_student_id uuid,
  p_phone      text
)
returns table (
  enrollment_id uuid,
  cohort_name   text,
  track_name    text,
  week_number   int,
  partner_name  text,
  session_date  date,
  is_today      boolean,
  is_meeting    boolean,
  recited_new    boolean,
  recited_review boolean,
  heard_recitation      boolean,
  prayed_with_memorised boolean,
  reported_at   timestamptz,
  teacher_name  text,
  duration_weeks int
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_given   text;
begin
  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_given := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  if v_student.phone_key is null
     or char_length(v_given) < 9
     or (v_student.phone_key <> v_given
         and right(v_student.phone_key, 9) <> right(v_given, 9)) then
    raise exception 'phone_mismatch' using errcode = '42501';
  end if;

  return query
    with mine as (
      select e.id as enrollment_id, c.id as cohort_id, c.name_ar as cohort_name,
             t.name_ar as track_name, c.start_date, c.timezone,
             t.duration_weeks, tt.name as teacher_name
        from public.track_enrollments e
        join public.track_cohorts c on c.id = e.cohort_id
        join public.tracks t on t.id = c.track_id
        left join public.teachers tt on tt.id = c.teacher_id
       where e.student_id = p_student_id
         and e.status in ('active', 'warned')
       limit 1
    ),
    span as (
      select m.*,
             (now() at time zone m.timezone)::date as today,
             (now() at time zone m.timezone)::date
               - (((now() at time zone m.timezone)::date - m.start_date) % 7)
               as meeting_day
        from mine m
    )
    select s.enrollment_id,
           s.cohort_name,
           s.track_name,
           least(((s.today - s.start_date) / 7)::int + 1, s.duration_weeks),
           (select coalesce(p.external_name, ps.name)
              from public.track_partners p
              left join public.track_enrollments pe on pe.id = p.partner_enrollment_id
              left join public.students ps on ps.id = pe.student_id
             where p.enrollment_id = s.enrollment_id
               and p.active_to is null
             limit 1),
           d.day::date,
           d.day::date = s.today,
           d.day::date = s.meeting_day,
           coalesce(r.recited_new, false),
           coalesce(r.recited_review, false),
           coalesce(r.heard_recitation, false),
           coalesce(r.prayed_with_memorised, false),
           r.updated_at,
           s.teacher_name,
           s.duration_weeks
      from span s
      cross join lateral generate_series(s.meeting_day, s.meeting_day + 6, interval '1 day') as d(day)
      left join public.track_day_reports r
             on r.enrollment_id = s.enrollment_id
            and r.session_date = d.day::date
     order by d.day;
end
$$;

revoke execute on function public.my_track_week(uuid, text) from public;
grant  execute on function public.my_track_week(uuid, text) to anon, authenticated;

commit;
