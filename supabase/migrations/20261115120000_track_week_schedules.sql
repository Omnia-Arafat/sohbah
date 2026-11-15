-- Weekly schedules, redesigned (canvas: جداول صحبة الأسبوعية).
--
-- Additive only: two nullable columns, one new read-only function and one
-- colour value. Nothing existing is altered or dropped, so a circle running
-- while this is applied keeps running.

-- =============================================================================
-- 1. When the teacher meets the cohort, printed at the top of the week.
--
-- A cohort's meeting already falls on the weekday of its start_date (see
-- my_track_week's meeting_day). These two are what the PRINTED schedule says,
-- "السبت · ٨ م بتوقيت القاهرة", which an admin types once per week. Null means
-- "work it out from the cohort", which is what a base week shared by several
-- cohorts usually wants.
-- =============================================================================

alter table public.track_weeks
  add column if not exists meeting_weekday smallint
    check (meeting_weekday between 0 and 6),
  add column if not exists meeting_time text;

comment on column public.track_weeks.meeting_weekday is
  '0 = Sunday .. 6 = Saturday (JavaScript getDay). Null: the cohort''s start weekday.';

-- =============================================================================
-- 2. my_track_schedules — which schedule a student is on, so she can browse
--    and download every week up to the current one.
--
-- my_track_week answers "what is today", by name. This answers "which track,
-- which cohort, which week", by id, because the weeks themselves are read
-- straight from track_weeks (published weeks are public under weeks_select).
-- Same phone check as my_track_week.
-- =============================================================================

create or replace function public.my_track_schedules(
  p_student_id uuid,
  p_phone      text
)
returns table (
  enrollment_id  uuid,
  track_id       uuid,
  cohort_id      uuid,
  track_name     text,
  cohort_name    text,
  current_week   int,
  duration_weeks int,
  start_date     date
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
    select e.id,
           t.id,
           c.id,
           t.name_ar,
           c.name_ar,
           greatest(1, least(
             (((now() at time zone c.timezone)::date - c.start_date) / 7) + 1,
             t.duration_weeks))::int,
           t.duration_weeks,
           c.start_date
      from public.track_enrollments e
      join public.track_cohorts c on c.id = e.cohort_id
      join public.tracks t on t.id = c.track_id
     where e.student_id = p_student_id
       and e.status in ('active', 'warned')
     order by e.joined_at;
end;
$$;

revoke all on function public.my_track_schedules(uuid, text) from public;
grant execute on function public.my_track_schedules(uuid, text) to anon, authenticated;

-- =============================================================================
-- 3. Sohbah's header colour: the leaf green of its logo.
--
-- This UPDATES an existing row (one column of the sohbah academy). It only
-- changes the colour of the academy name in the header and on printed
-- reports.
-- =============================================================================

update public.academies
   set primary_color = '#2F7D32'
 where slug = 'sohbah';
