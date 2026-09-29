-- Close the two functions that return both sides' circles.
--
-- academy_schedule and academy_live_circles hand back every active circle in
-- the academy with its teacher's name, men's and women's alike, and the
-- reciting student's name. The pages filter the rows to the viewer's side, but
-- both functions were granted to anon, so anyone holding the public key could
-- call them directly and read the other side. The app now calls them only from
-- the server with the service role (src/lib/schedule-boards.ts and the academy
-- home page), so they are closed to everyone else.
--
-- NOT ADDITIVE: this changes the grants on two existing functions. No table,
-- row, policy or function body changes.
--
-- ORDER MATTERS: deploy the app change first. Running this before the new code
-- is live empties the home page and the timetable until it is.
--
-- Rollback:
--   grant execute on function public.academy_schedule(uuid) to anon, authenticated;
--   grant execute on function public.academy_live_circles(uuid) to anon, authenticated;

begin;

revoke execute on function public.academy_schedule(uuid) from public, anon, authenticated;
grant  execute on function public.academy_schedule(uuid) to service_role;

revoke execute on function public.academy_live_circles(uuid) from public, anon, authenticated;
grant  execute on function public.academy_live_circles(uuid) to service_role;

commit;
