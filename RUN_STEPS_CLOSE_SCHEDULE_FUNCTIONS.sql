begin;

revoke execute on function public.academy_schedule(uuid) from public, anon, authenticated;
grant  execute on function public.academy_schedule(uuid) to service_role;

revoke execute on function public.academy_live_circles(uuid) from public, anon, authenticated;
grant  execute on function public.academy_live_circles(uuid) to service_role;

commit;
