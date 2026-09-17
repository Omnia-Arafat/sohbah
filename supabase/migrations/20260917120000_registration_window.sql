-- Students were signing their names into the queue hours before the circle.
--
-- `join_circle()` checked who you are, your gender and the capacity, and
-- nothing at all about WHEN. A student could take place 1 in the queue the
-- morning before, and — because the day was never checked either — could join
-- a circle on a day it does not run at all.
--
-- The window is now: opens at the circle's start time, closes one hour after
-- it ends. Both ends are in the CIRCLE's timezone, never the student's. That
-- part was already right everywhere else in the schema — `circles.timezone`
-- exists and `session_date` is computed through it — so a 2pm حلقة in
-- Asia/Riyadh is 2pm Riyadh for a student in Cairo, Sana'a or Amman alike.
-- Nothing here reads the student's clock, which is what makes it safe: a
-- device with the wrong time cannot open or close the door.
--
-- MIDNIGHT. One of this academy's circles starts at 22:00 and runs an hour, so
-- its window closes at 00:00 the following day — and a 21:30 circle would
-- close at 23:30 while a 23:00 one closes at 01:00 tomorrow. At 00:30 the
-- local date has already rolled over, so asking only "does today's occurrence
-- contain now?" would both refuse the join and, worse, file it under
-- tomorrow's `session_date` if it were allowed. The window is therefore looked
-- for in today's occurrence first and then YESTERDAY's, and the session date
-- that comes back is the day the circle actually started.

-- --- One definition of the window, shared by both callers -------------------

create or replace function public.circle_registration_window(
  p_start_time       time,
  p_duration_minutes int,
  p_timezone         text,
  p_days             smallint[]
)
returns table (
  session_date date,
  opens_at     timestamptz,
  closes_at    timestamptz,
  -- 'open' | 'before' | 'after' | 'not_today'
  state        text
)
language plpgsql stable set search_path = public
as $$
declare
  -- The circle's own wall clock. `now()` is absolute; this is where the
  -- student's own timezone stops mattering.
  v_local  timestamp := now() at time zone p_timezone;
  v_today  date      := v_local::date;
  v_try    date;
  v_opens  timestamp;
  v_closes timestamp;
  -- Late arrivals still belong in the session they turned up to.
  v_grace  interval  := interval '1 hour';
  v_len    interval  := make_interval(mins => coalesce(p_duration_minutes, 60));
begin
  foreach v_try in array array[v_today, v_today - 1]
  loop
    if extract(dow from v_try)::smallint = any(p_days) then
      v_opens  := v_try + p_start_time;
      v_closes := v_opens + v_len + v_grace;

      if v_local >= v_opens and v_local <= v_closes then
        return query
          select v_try,
                 v_opens  at time zone p_timezone,
                 v_closes at time zone p_timezone,
                 'open'::text;
        return;
      end if;
    end if;
  end loop;

  -- Outside every window. Say which side of it we are on, so the screen can
  -- tell her "it opens at 2" instead of a flat refusal.
  if extract(dow from v_today)::smallint = any(p_days) then
    v_opens  := v_today + p_start_time;
    v_closes := v_opens + v_len + v_grace;

    return query
      select v_today,
             v_opens  at time zone p_timezone,
             v_closes at time zone p_timezone,
             case when v_local < v_opens then 'before' else 'after' end;
    return;
  end if;

  /*
    Today is not one of this circle's days — but it may still be the small
    hours after one of them. A 22:00 circle running an hour closes at 00:00,
    so at 00:30 the honest answer is "registration has closed", not "the circle
    does not meet today": she was there, she is half an hour late, and being
    told the wrong thing would send her looking for a circle on another day.

    Only while it is still that night. "Yesterday's window closed at midnight"
    is the useful answer at half past midnight and a misleading one at ten the
    following evening, where the true answer is that the circle does not run
    today — so it is bounded by first light rather than by the calendar date,
    which stays true all day.
  */
  v_try := v_today - 1;
  if extract(dow from v_try)::smallint = any(p_days) then
    v_opens  := v_try + p_start_time;
    v_closes := v_opens + v_len + v_grace;

    if v_closes::date = v_today and v_local < v_today + time '06:00' then
      return query
        select v_try,
               v_opens  at time zone p_timezone,
               v_closes at time zone p_timezone,
               'after'::text;
      return;
    end if;
  end if;

  return query
    select v_today, null::timestamptz, null::timestamptz, 'not_today'::text;
end
$$;

comment on function public.circle_registration_window(time, int, text, smallint[]) is
  'When a circle accepts joins: from its start time until an hour after it ends, in the circle''s own timezone. Looks at yesterday too, for circles that run past midnight.';

revoke execute on function public.circle_registration_window(time, int, text, smallint[]) from public;
grant  execute on function public.circle_registration_window(time, int, text, smallint[]) to anon, authenticated;

-- --- The screen needs to know before the student presses anything ----------
-- Return type changes, so drop and recreate, then re-grant.

drop function if exists public.circle_public_info(text);

create function public.circle_public_info(p_slug text)
returns table (
  id                 uuid,
  name               text,
  type               text,
  gender_category    text,
  session_link       text,
  start_time         time,
  timezone           text,
  session_date       date,
  meets_today        boolean,
  academy_id         uuid,
  max_students       int,
  registration_state text,
  opens_at           timestamptz,
  closes_at          timestamptz
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.type, c.gender_category,
         c.session_link, c.start_time, c.timezone,
         w.session_date,
         extract(dow from (now() at time zone c.timezone)::date)::smallint = any(c.days_of_week),
         c.academy_id,
         c.max_students,
         w.state,
         w.opens_at,
         w.closes_at
    from public.circles c
    cross join lateral public.circle_registration_window(
      c.start_time, c.duration_minutes, c.timezone, c.days_of_week
    ) w
   where c.registration_slug = p_slug and c.is_active;
$$;

revoke execute on function public.circle_public_info(text) from public;
grant  execute on function public.circle_public_info(text) to anon, authenticated;

-- --- And the enforcement point itself ---------------------------------------
-- The screen can be out of date by a minute; this is what actually decides.

create or replace function public.join_circle(p_slug text, p_student_id uuid)
returns table (attendance_id uuid, session_date date, queue_order int, already_joined boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_circle  public.circles%rowtype;
  v_student public.students%rowtype;
  v_date    date;
  v_state   text;
  v_row     public.attendance_records%rowtype;
  v_next    int;
  v_current int;
begin
  select * into v_circle from public.circles
   where registration_slug = p_slug and is_active;
  if not found then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  if v_student.gender_category is distinct from v_circle.gender_category then
    raise exception 'gender_mismatch' using errcode = '42501';
  end if;

  select w.session_date, w.state into v_date, v_state
    from public.circle_registration_window(
      v_circle.start_time, v_circle.duration_minutes, v_circle.timezone, v_circle.days_of_week
    ) w;

  -- Checked before the "already joined" lookup on purpose: outside the window
  -- there is no session to be already joined to.
  if v_state = 'not_today' then
    raise exception 'not_today' using errcode = 'P0001';
  elsif v_state = 'before' then
    raise exception 'not_open_yet' using errcode = 'P0001';
  elsif v_state = 'after' then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;

  select * into v_row
    from public.attendance_records ar
   where ar.student_id = p_student_id
     and ar.circle_id = v_circle.id
     and ar.session_date = v_date;

  -- Already having a place is never blocked by capacity, even if the circle
  -- has since filled up around them — this only re-confirms their own row.
  if found then
    return query select v_row.id, v_row.session_date, v_row.queue_order, true;
    return;
  end if;

  -- Serialize position assignment per circle+day so simultaneous joins at the
  -- start of a session cannot collide on queue_order — and cannot both slip
  -- into the last open seat either: the capacity check below runs inside the
  -- same lock, so it sees a count that cannot change under it. This matters
  -- more now than it did: everyone arrives at the same second by design.
  perform pg_advisory_xact_lock(hashtext(v_circle.id::text || v_date::text));

  if v_circle.max_students is not null then
    select count(*) into v_current
      from public.attendance_records ar
     where ar.circle_id = v_circle.id and ar.session_date = v_date;

    if v_current >= v_circle.max_students then
      raise exception 'circle_full' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(max(ar.queue_order), 0) + 1 into v_next
    from public.attendance_records ar
   where ar.circle_id = v_circle.id and ar.session_date = v_date;

  insert into public.attendance_records (student_id, circle_id, session_date, queue_order)
  values (p_student_id, v_circle.id, v_date, v_next)
  returning * into v_row;

  return query select v_row.id, v_row.session_date, v_row.queue_order, false;
end
$$;
