-- The public timetable's data source.
--
-- `circles` is readable only by signed-in staff (circles_select_own_or_staff),
-- and deliberately so: the row carries `session_link`, which is the key to the
-- live room. A visitor reading the timetable needs none of that — they need
-- the day, the hour and who teaches it — so this follows the same shape the
-- public circle page already uses (circle_public_info): a SECURITY DEFINER
-- function that returns exactly the public columns and nothing else. No RLS
-- policy is loosened, and `session_link` never leaves the database.

create or replace function public.academy_schedule(p_academy_id uuid)
returns table (
  id uuid,
  name text,
  type text,
  gender_category text,
  start_time time,
  timezone text,
  days_of_week smallint[],
  registration_slug text,
  teacher_name text
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.type, c.gender_category,
         c.start_time, c.timezone, c.days_of_week,
         c.registration_slug, t.name
    from public.circles c
    join public.teachers t on t.id = c.teacher_id
   where c.academy_id = p_academy_id
     and c.is_active
   order by c.start_time, t.name;
$$;

revoke all on function public.academy_schedule(uuid) from public;
grant execute on function public.academy_schedule(uuid) to anon, authenticated;
