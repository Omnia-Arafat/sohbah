-- Backfill: two functions the repo defines but the remote database never got.
--
-- The migration ledger on the linked project only recorded the first two
-- migrations; everything after that was applied by pasting SQL into the
-- dashboard, so the ledger and the database had drifted apart. Probing the
-- remote schema object by object showed all of it present EXCEPT these two
-- functions, from 20260904090000 and 20260904120000.
--
-- Those two migrations are not re-run to fix that, for one specific reason:
--
--   20260904120000 also does
--       drop policy if exists circles_update_own_or_admin on public.circles;
--       create policy circles_update_staff on public.circles
--         for update to authenticated
--         using (public.is_staff_of(academy_id));
--
--   and 20260904140000 — which IS applied — already replaced that policy with
--   the narrower `circles_update_own_or_supervisor` (own circle, or a مشرفة).
--   Re-running the older file today would not restore a historical state: it
--   would ADD `circles_update_staff` next to the current policy. RLS policies
--   are OR'd together, so the effect would be to let any معلمة edit any circle
--   in her academy. That is a privilege escalation, not a catch-up.
--
-- So the policy half of that migration stays superseded, as intended, and only
-- the function it introduced is created here. `schedule_board_entries` from
-- 20260904090000 is carried over as well: nothing calls it today (the schedule
-- page reads `academy_schedule` instead), but leaving it absent while the
-- ledger claims the migration ran is exactly the drift that caused this.
--
-- Both are `create or replace`, so this file is safe to run more than once.

-- From 20260904090000 — the public timetable's read path. Returns only what a
-- timetable pinned to a notice board would show: never a session link or a
-- phone number.
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
grant  execute on function public.schedule_board_entries(uuid) to anon, authenticated;

-- From 20260904120000 — "any approved teacher or supervisor of that one
-- academy". The curriculum tables in the next migration build their RLS on
-- this, which is what made its absence blocking rather than cosmetic.
create or replace function public.is_staff_of(p_academy_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teachers
     where auth_user_id = auth.uid()
       and is_active
       and academy_id = p_academy_id
  )
$$;

comment on function public.is_staff_of(uuid) is
  'Any approved teacher or supervisor of that one academy.';

revoke execute on function public.is_staff_of(uuid) from public;
grant  execute on function public.is_staff_of(uuid) to authenticated;
