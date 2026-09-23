-- المسارات، المرحلة الثانية: the half of the cycle that runs every day.
--
-- Phase one (20260921140000) built the shape: tracks, cohorts, the forty
-- weeks, the rules, the enrolments. Every table the daily loop needs already
-- exists — track_recitations, track_meeting_scores, track_absences. What was
-- missing is the way in and the way out: a student has no login here, so she
-- cannot write a row herself, and nobody had written the arithmetic that
-- turns those rows into a score out of forty.
--
-- WHY THE STUDENT'S WRITES ARE FUNCTIONS, NOT POLICIES
--
-- There is no student session in this system. `find_me()` matches her by name
-- and phone and hands the browser her id; `join_circle(p_slug, p_student_id)`
-- then writes on her behalf as a security-definer function. Every student
-- write in this schema works that way, and these follow it exactly rather
-- than inventing a second pattern: the RLS on track_recitations stays
-- staff-only, and the function is the only door.
--
-- That door is narrow on purpose. `log_track_recitation` will not write for a
-- student who is not actually enrolled and running, will not accept a day
-- that is not a memorisation day, and will not invent a week number — it
-- computes it from the cohort's start date, the same way every other part of
-- this feature does.

begin;

-- =============================================================================
-- 1. What a student sees when she opens the app
--
-- One round trip: her cohort, where it is, what today asks of her, who her
-- رفيقة is, and what she has scored this week. The page that shows this is
-- the first thing she opens every day, so it is one call, not five.
-- =============================================================================

create or replace function public.track_today(p_student_id uuid)
returns table (
  enrollment_id  uuid,
  cohort_id      uuid,
  cohort_name    text,
  track_name     text,
  week_number    int,
  duration_weeks int,
  day_index      smallint,
  -- Today's assignment, null on the meeting day and on Friday.
  new_from_surah smallint,
  new_from_ayah  smallint,
  new_to_surah   smallint,
  new_to_ayah    smallint,
  review_text    text,
  meeting_notes  text,
  -- Null until the week is published; an unpublished week must not reach her.
  is_published   boolean,
  partner_name   text,
  logged_today   boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_enr    public.track_enrollments%rowtype;
  v_cohort public.track_cohorts%rowtype;
  v_today  date;
  v_week   int;
  v_day    smallint;
  v_week_row public.track_weeks%rowtype;
  v_day_row  public.track_week_days%rowtype;
begin
  select e.* into v_enr
    from public.track_enrollments e
   where e.student_id = p_student_id
     and e.status in ('active', 'warned')
   limit 1;

  if not found then
    return;                       -- not on a track: the caller shows her page without one
  end if;

  select c.* into v_cohort from public.track_cohorts c where c.id = v_enr.cohort_id;
  if v_cohort.status <> 'running' then
    return;
  end if;

  v_today := (now() at time zone v_cohort.timezone)::date;
  v_week  := public.track_current_week(v_cohort.id);

  /*
    Which day of the week is today?

    day_index 0 is the meeting, 1..5 the memorisation days, 6 the rest day.
    They are POSITIONS in the cohort's own week, not weekdays: a cohort that
    starts on a Tuesday has its rest day fall on a Friday, in the middle of
    its week, which is exactly what one of the academy's printed sheets shows.
    So the position is counted from the cohort's start date.
  */
  v_day := ((v_today - v_cohort.start_date) % 7)::smallint;

  -- This cohort's own version of the week if it has one, else the track's
  -- shared week. `cohort_id nulls last` does the choosing in one read rather
  -- than a query followed by a fallback query.
  select w.* into v_week_row
    from public.track_weeks w
   where w.track_id = v_cohort.track_id
     and w.week_number = v_week
     and (w.cohort_id is null or w.cohort_id = v_cohort.id)
   order by w.cohort_id nulls last
   limit 1;

  select d.* into v_day_row
    from public.track_week_days d
   where d.week_id = v_week_row.id and d.day_index = v_day;

  return query
  select
    v_enr.id,
    v_cohort.id,
    v_cohort.name_ar,
    (select t.name_ar from public.tracks t where t.id = v_cohort.track_id),
    v_week,
    (select t.duration_weeks from public.tracks t where t.id = v_cohort.track_id),
    v_day,
    v_day_row.new_from_surah,
    v_day_row.new_from_ayah,
    v_day_row.new_to_surah,
    v_day_row.new_to_ayah,
    v_day_row.review_text_ar,
    v_day_row.notes_ar,
    coalesce(v_week_row.is_published, false),
    (select coalesce(p.external_name,
                     (select s.name from public.students s
                       join public.track_enrollments pe on pe.student_id = s.id
                      where pe.id = p.partner_enrollment_id))
       from public.track_partners p
      where p.enrollment_id = v_enr.id
        and p.active_to is null
      order by p.active_from desc
      limit 1),
    exists (select 1 from public.track_recitations r
             where r.enrollment_id = v_enr.id and r.session_date = v_today);
end
$$;

comment on function public.track_today(uuid) is
  'Everything a student''s home screen needs about her track, in one call. Empty when she is on no running track.';

revoke execute on function public.track_today(uuid) from public;
grant  execute on function public.track_today(uuid) to anon, authenticated;

-- =============================================================================
-- 2. She records her سرد
--
-- The daily سرد happens between two students with no معلمة present, which is
-- the whole point of نظام الرفيقة — so the student is the one who records it,
-- and the رفيقة who listened is named on the row.
-- =============================================================================

create or replace function public.log_track_recitation(
  p_student_id  uuid,
  p_from_surah  smallint,
  p_from_ayah   smallint,
  p_to_surah    smallint,
  p_to_ayah     smallint,
  p_kind        text default 'new',
  p_listener_student_id uuid default null,
  p_listener_external_name text default null
)
returns public.track_recitations
language plpgsql security definer set search_path = public
as $$
declare
  v_enr    public.track_enrollments%rowtype;
  v_cohort public.track_cohorts%rowtype;
  v_today  date;
  v_week   int;
  v_day    smallint;
  v_row    public.track_recitations%rowtype;
begin
  select e.* into v_enr
    from public.track_enrollments e
   where e.student_id = p_student_id
     and e.status in ('active', 'warned')
   limit 1;

  if not found then
    raise exception 'not_on_a_track' using errcode = 'P0001';
  end if;

  select c.* into v_cohort from public.track_cohorts c where c.id = v_enr.cohort_id;
  if v_cohort.status <> 'running' then
    raise exception 'cohort_not_running' using errcode = 'P0001';
  end if;

  v_today := (now() at time zone v_cohort.timezone)::date;
  v_week  := public.track_current_week(v_cohort.id);
  v_day   := ((v_today - v_cohort.start_date) % 7)::smallint;

  -- The meeting day and the rest day carry no سرد of their own: the meeting
  -- is scored by the معلمة, and Friday is for catching up.
  if v_day = 0 or v_day = 6 then
    raise exception 'not_a_recitation_day' using errcode = 'P0001';
  end if;

  if (p_to_surah, p_to_ayah) < (p_from_surah, p_from_ayah) then
    raise exception 'range_backwards' using errcode = 'P0001';
  end if;

  /*
    One row per day, updated rather than appended.

    Recording twice on the same day is a correction — "I said the wrong
    range" — not a second سرد, and the score counts DAYS, so a second row
    would silently double a day that was only lived once.
  */
  insert into public.track_recitations (
    enrollment_id, cohort_id, student_id, session_date, week_number, day_index,
    kind, from_surah, from_ayah, to_surah, to_ayah,
    listener_student_id, listener_external_name
  )
  values (
    v_enr.id, v_cohort.id, p_student_id, v_today, v_week, v_day,
    coalesce(p_kind, 'new'), p_from_surah, p_from_ayah, p_to_surah, p_to_ayah,
    p_listener_student_id, nullif(btrim(p_listener_external_name), '')
  )
  on conflict (enrollment_id, session_date) do update
    set kind = excluded.kind,
        from_surah = excluded.from_surah,
        from_ayah  = excluded.from_ayah,
        to_surah   = excluded.to_surah,
        to_ayah    = excluded.to_ayah,
        listener_student_id    = excluded.listener_student_id,
        listener_external_name = excluded.listener_external_name
  returning * into v_row;

  return v_row;
end
$$;

comment on function public.log_track_recitation is
  'A student records her own daily سرد. One row per day: logging again corrects it rather than adding a second.';

revoke execute on function public.log_track_recitation from public;
grant  execute on function public.log_track_recitation to anon, authenticated;

-- =============================================================================
-- 3. The score
--
-- Out of forty, and every number in it comes from track_rule_sets — so an
-- academy that changes five points a day to four changes a row, not this
-- view. The week's rules are the ones in force during that week, which is
-- why a past week keeps the total it was scored under.
-- =============================================================================

create or replace view public.track_week_scores
with (security_invoker = true) as
with weeks as (
  select
    e.id   as enrollment_id,
    e.cohort_id,
    e.student_id,
    c.track_id,
    w.week_number
  from public.track_enrollments e
  join public.track_cohorts c on c.id = e.cohort_id
  -- Every week the cohort has actually reached, and no further.
  cross join lateral generate_series(1, greatest(public.track_current_week(c.id), 1)) as w(week_number)
  where e.status in ('active', 'warned', 'completed')
),
rules as (
  select
    weeks.enrollment_id,
    weeks.week_number,
    rs.id as rule_set_id,
    sr.points_per_recitation_day,
    sr.recitation_days_per_week,
    sr.star_threshold
  from weeks
  join lateral (
    select r.* from public.track_rule_sets r
     where r.track_id = weeks.track_id
       and (r.cohort_id is null or r.cohort_id = weeks.cohort_id)
       and r.effective_from <= current_date
     order by r.cohort_id nulls last, r.effective_from desc
     limit 1
  ) rs on true
  join public.track_score_rules sr on sr.rule_set_id = rs.id
)
select
  r.enrollment_id,
  r.week_number,
  -- Days she actually recited. Counted as DAYS, never as rows: the unique
  -- index on (enrollment_id, session_date) is what makes that safe.
  count(distinct rec.session_date)::int as recitation_days,
  (count(distinct rec.session_date) * r.points_per_recitation_day)::numeric(6,2)
    as recitation_points,
  coalesce(sum(ms.points_awarded), 0)::numeric(6,2) as meeting_points,
  (count(distinct rec.session_date) * r.points_per_recitation_day
     + coalesce(sum(ms.points_awarded), 0))::numeric(6,2) as total_points,
  (r.points_per_recitation_day * r.recitation_days_per_week
     + coalesce((select sum(mc.points) from public.track_meeting_components mc
                  where mc.rule_set_id = r.rule_set_id and mc.is_active), 0)
  )::numeric(6,2) as possible_points,
  -- متألقة الحلقة. A null threshold means "the full total", which is how the
  -- seed ships it, so adding a meeting component moves the bar with it.
  (count(distinct rec.session_date) * r.points_per_recitation_day
     + coalesce(sum(ms.points_awarded), 0))
  >= coalesce(
       r.star_threshold,
       r.points_per_recitation_day * r.recitation_days_per_week
         + coalesce((select sum(mc.points) from public.track_meeting_components mc
                      where mc.rule_set_id = r.rule_set_id and mc.is_active), 0)
     ) as earned_star
from rules r
left join public.track_recitations rec
       on rec.enrollment_id = r.enrollment_id
      and rec.week_number   = r.week_number
left join public.track_meeting_scores ms
       on ms.enrollment_id = r.enrollment_id
      and ms.week_number   = r.week_number
group by
  r.enrollment_id, r.week_number, r.rule_set_id,
  r.points_per_recitation_day, r.recitation_days_per_week, r.star_threshold;

comment on view public.track_week_scores is
  'The weekly score out of the week''s own possible total. Every number comes from track_rule_sets, so changing a rule changes the score without touching this view.';

-- =============================================================================
-- 4. The معلمة's week grid
--
-- One row per student, one cell per day. This is the screen she opens on the
-- day of the لقاء, so it answers in one call: who recited which day, who was
-- excused, and what each of them stands at.
-- =============================================================================

create or replace function public.cohort_week_grid(
  p_cohort_id uuid,
  p_week      int default null
)
returns table (
  enrollment_id uuid,
  student_id    uuid,
  student_name  text,
  partner_name  text,
  status        text,
  -- Seven characters, one per day_index: 'r' recited · 'x' missed ·
  -- 'e' excused · '-' not a recitation day · '.' still to come.
  days          text,
  recitation_days int,
  total_points  numeric,
  possible_points numeric,
  earned_star   boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_cohort public.track_cohorts%rowtype;
  v_week   int;
  v_today  date;
begin
  select c.* into v_cohort from public.track_cohorts c where c.id = p_cohort_id;
  if not found then
    return;
  end if;

  -- A معلمة sees her own cohort; a مشرفة sees any in her academy.
  if not public.can_manage_cohort(p_cohort_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_week  := coalesce(p_week, public.track_current_week(p_cohort_id));
  v_today := (now() at time zone v_cohort.timezone)::date;

  return query
  select
    e.id,
    e.student_id,
    s.name,
    (select coalesce(p.external_name,
                     (select s2.name from public.students s2
                       join public.track_enrollments pe on pe.student_id = s2.id
                      where pe.id = p.partner_enrollment_id))
       from public.track_partners p
      where p.enrollment_id = e.id and p.active_to is null
      order by p.active_from desc limit 1),
    e.status,
    (
      select string_agg(
        case
          when d.idx = 0 or d.idx = 6 then '-'
          when exists (select 1 from public.track_recitations r
                        where r.enrollment_id = e.id
                          and r.week_number = v_week
                          and r.day_index = d.idx) then 'r'
          when exists (select 1 from public.track_absences a
                        where a.enrollment_id = e.id
                          and a.absence_date =
                              v_cohort.start_date + (v_week - 1) * 7 + d.idx) then 'e'
          -- A day that has not arrived is not an absence.
          when v_cohort.start_date + (v_week - 1) * 7 + d.idx > v_today then '.'
          else 'x'
        end, '' order by d.idx)
      from generate_series(0, 6) as d(idx)
    ),
    coalesce(sc.recitation_days, 0),
    coalesce(sc.total_points, 0),
    coalesce(sc.possible_points, 0),
    coalesce(sc.earned_star, false)
  from public.track_enrollments e
  join public.students s on s.id = e.student_id
  left join public.track_week_scores sc
         on sc.enrollment_id = e.id and sc.week_number = v_week
  where e.cohort_id = p_cohort_id
    and e.status in ('active', 'warned')
  order by s.name;
end
$$;

comment on function public.cohort_week_grid(uuid, int) is
  'One row per student for one week: a seven-character day strip and her score. Defaults to the cohort''s current week.';

revoke execute on function public.cohort_week_grid(uuid, int) from public;
grant  execute on function public.cohort_week_grid(uuid, int) to authenticated;

commit;
