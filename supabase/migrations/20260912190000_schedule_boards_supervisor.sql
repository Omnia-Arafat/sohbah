-- Publishing the weekly timetable moves from admin-only to مشرفة-and-admin.
--
-- Why now: the public timetable renders *boards*, and a circle whose type has
-- no published board is invisible on it. This academy had one board covering
-- free_recitation, so 20 of 25 active circles were missing from the schedule
-- with nothing on any screen saying so. The warning that now surfaces that
-- lives on /admin/schedules — which a مشرفة could not open, so the person most
-- likely to notice the problem was the one person unable to fix it.
--
-- This is a deliberate widening, asked for explicitly. It is written the
-- careful way, because the last time a policy was widened here by accident it
-- would have let any معلمة edit any circle:
--
--   * REPLACE, never add. Each old policy is dropped and a new one created in
--     its place. RLS policies are OR'd, so leaving the old one beside the new
--     one would be harmless here but sets the wrong precedent; more to the
--     point, two policies expressing one rule drift apart.
--   * `can_supervise()` is مشرفة OR admin, already scoped to a single academy.
--     A معلمة is NOT included — she still cannot publish to the public page.
--   * SELECT keeps the same shape: published boards are world-readable, and
--     drafts are visible to the staff who may act on them.

-- --- SELECT: drafts become visible to a مشرفة as well as an admin -----------
drop policy if exists schedule_boards_select on public.schedule_boards;

create policy schedule_boards_select on public.schedule_boards
  for select to anon, authenticated
  using (is_published or public.can_supervise(academy_id));

-- --- INSERT / UPDATE / DELETE ----------------------------------------------
drop policy if exists schedule_boards_admin_insert on public.schedule_boards;
drop policy if exists schedule_boards_admin_update on public.schedule_boards;
drop policy if exists schedule_boards_admin_delete on public.schedule_boards;

create policy schedule_boards_supervisor_insert on public.schedule_boards
  for insert to authenticated
  with check (public.can_supervise(academy_id));

create policy schedule_boards_supervisor_update on public.schedule_boards
  for update to authenticated
  using (public.can_supervise(academy_id))
  with check (public.can_supervise(academy_id));

create policy schedule_boards_supervisor_delete on public.schedule_boards
  for delete to authenticated
  using (public.can_supervise(academy_id));
