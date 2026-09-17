-- "She is registered, and her name is not in the list."
--
-- Reported by the academy: a student joins, the «الدخول إلى الحلقة» button
-- unlocks for her — so `join_circle()` returned success and a row exists — and
-- yet the queue does not show her, and the count others see makes the circle
-- look full.
--
-- It is not a lock. `uq_attendance_student_session` already makes a second row
-- for the same student impossible and `uq_attendance_queue_position` does the
-- same for positions; production has no duplicates and no orphan rows. The two
-- sides simply disagree about WHICH DAY they are talking about.
--
--   join_circle()   writes  session_date = the day the session started
--   circle_queue()  reads   session_date = (now() at time zone tz)::date
--
-- Those are the same date for most of the day and different either side of
-- midnight, which is exactly when this academy has circles running: one starts
-- at 22:00, and registration stays open for an hour after it ends. A student
-- who joins at 23:58 is written under today; a page that loads at 00:01 asks
-- for tomorrow and finds nobody — her included. She is registered, her button
-- is unlocked, and the list is empty.
--
-- 20260917120000 made this worse rather than better: it gave `join_circle` a
-- window that correctly resolves a past-midnight join back to the day the
-- circle started, while `circle_queue` kept computing its own date. Between
-- 23:00 and 00:00 the two now disagree by a whole day for that circle.
--
-- The fix is not a third date calculation. It is to stop having more than one:
-- the queue asks `circle_registration_window()` the same question the join
-- asked, so a row that was written for a session is read back with it.
--
-- Deliberately unchanged here: `circle_lesson`, `circle_materials`,
-- `academy_live_circles` and `teacher_today_circles` each still derive their
-- own date. They should converge on this too, but they decide what to DISPLAY
-- — a lesson card, a count on a dashboard — and getting one of those wrong for
-- an hour is not a student who cannot find her name. Changing them is a
-- separate, testable step, not something to slip into a fix for this.

create or replace function public.circle_queue(p_slug text)
returns table (
  attendance_id uuid, student_id uuid, name text, father_name text,
  queue_order int, attendance_status text, recitation_status text, joined_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select ar.id, s.id, s.name, s.father_name,
         ar.queue_order, ar.attendance_status, ar.recitation_status, ar.joined_at
    from public.circles c
    -- The one definition of "which session is now", shared with join_circle()
    -- and circle_public_info(). Outside a window it returns today, which is
    -- what this function used to compute on its own — so nothing changes for
    -- the circles that do not run past midnight.
    cross join lateral public.circle_registration_window(
      c.start_time, c.duration_minutes, c.timezone, c.days_of_week
    ) w
    join public.attendance_records ar
      on ar.circle_id = c.id
     and ar.session_date = w.session_date
    join public.students s on s.id = ar.student_id
   where c.registration_slug = p_slug and c.is_active
   order by ar.queue_order;
$$;

comment on function public.circle_queue(text) is
  'Today''s queue for a circle, for the same session `join_circle()` writes to — both ask `circle_registration_window()` rather than each computing a date.';
