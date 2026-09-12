-- "أي حلقة شغالة دلوقتي؟" — the question the front door is opened to answer.
--
-- The home page leads with today's circles, but "today" is not what a student
-- opening the app at 5pm wants: she wants the one that is RUNNING, and whether
-- her turn has come. That needs three things the public timetable does not
-- carry — the circle's duration, the clock in the circle's own timezone, and
-- the state of its queue.
--
-- A NEW function rather than widening `academy_schedule`: changing that one's
-- return type means dropping and recreating it, and for the seconds in between
-- the public timetable on a live site returns nothing. Nothing existing is
-- touched here.
--
-- WHAT IT DELIBERATELY DOES NOT RETURN: the session link. A circle's link is
-- shared by its معلمة, and a public page listing every running circle's link
-- would hand a stranger the door to all of them. Names and counts only, which
-- is what the circle's own page already shows to anyone holding its link.

create or replace function public.academy_live_circles(p_academy_id uuid)
returns table (
  circle_id         uuid,
  circle_name       text,
  circle_type       text,
  gender_category   text,
  teacher_name      text,
  registration_slug text,
  start_time        time,
  timezone          text,
  session_date      date,
  -- Whoever is reciting at this moment, or null between turns. The queue's
  -- own page shows this to anyone with the link; it is the single most useful
  -- fact on the screen and the reason a student refreshes.
  reciting_name     text,
  waiting_count     bigint,
  done_count        bigint,
  joined_count      bigint
)
language sql stable security definer set search_path = public
as $$
  with running as (
    select c.*,
           (now() at time zone c.timezone)::date as local_date,
           (now() at time zone c.timezone)::time as local_time
      from public.circles c
     where c.is_active
       and c.academy_id = p_academy_id
  )
  select r.id, r.name, r.type, r.gender_category, t.name, r.registration_slug,
         r.start_time, r.timezone, r.local_date,
         (select s.name
            from public.attendance_records ar
            join public.students s on s.id = ar.student_id
           where ar.circle_id = r.id
             and ar.session_date = r.local_date
             and ar.recitation_status = 'reciting'
           order by ar.queue_order
           limit 1),
         count(*) filter (where ar.recitation_status = 'waiting'),
         count(*) filter (where ar.recitation_status = 'done'),
         count(ar.id)
    from running r
    join public.teachers t on t.id = r.teacher_id
    left join public.attendance_records ar
           on ar.circle_id = r.id and ar.session_date = r.local_date
   where
     -- Meeting today, in the circle's own calendar. `days_of_week` follows the
     -- Postgres dow convention (0 = Sunday), which is what extract() gives.
     extract(dow from r.local_date)::smallint = any(r.days_of_week)
     -- And inside its own hour: from the start time until the session ends.
     -- A grace period is deliberately NOT added — a circle that finished is
     -- not "happening now", and leaving it on the front door for another
     -- twenty minutes is how a student joins an empty room.
     and r.local_time >= r.start_time
     and r.local_time < r.start_time + make_interval(mins => r.duration_minutes)
   group by r.id, r.name, r.type, r.gender_category, t.name,
            r.registration_slug, r.start_time, r.timezone, r.local_date
   order by r.start_time;
$$;

revoke execute on function public.academy_live_circles(uuid) from public;
grant  execute on function public.academy_live_circles(uuid) to anon, authenticated;

comment on function public.academy_live_circles(uuid) is
  'Circles running at this moment, with queue counts. No session links.';
