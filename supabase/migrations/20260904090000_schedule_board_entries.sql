-- The public schedule page could not actually show anything.
--
-- `schedule_boards` is readable by anyone, but the rows a board renders come
-- from `circles` and `teachers`, and RLS on both is scoped to the teacher who
-- owns the circle or an admin of the academy. A signed-out visitor therefore
-- got an empty result — no error, just nothing — and every published board
-- rendered as "no active circles yet".
--
-- Same shape as `circle_public_info`: a SECURITY DEFINER function that returns
-- only what a timetable pinned to a notice board would show anyway — circle
-- name, type, section, time and the teacher's name — and never a phone number,
-- a session link, or anything else the tables hold.

create or replace function public.schedule_board_entries(p_academy_id uuid)
returns table (
  circle_id         uuid,
  circle_name       text,
  circle_type       text,
  gender_category   text,
  start_time        time,
  timezone          text,
  days_of_week      smallint[],
  registration_slug text,
  teacher_name      text
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.type, c.gender_category, c.start_time, c.timezone,
         c.days_of_week, c.registration_slug, t.name
    from public.circles c
    join public.teachers t on t.id = c.teacher_id
   where c.is_active
     and c.academy_id = p_academy_id
   order by c.start_time;
$$;

revoke execute on function public.schedule_board_entries(uuid) from public;
grant execute on function public.schedule_board_entries(uuid) to anon, authenticated;
