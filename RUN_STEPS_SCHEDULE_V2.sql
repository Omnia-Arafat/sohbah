alter table public.schedule_boards
  add column start_from time,
  add column start_to   time;

alter table public.schedule_boards
  add constraint chk_schedule_boards_time_window
    check (start_from is null or start_to is null or start_from <= start_to);

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

delete from public.circles
 where id in (
   '7236640e-b2a5-4bde-bdef-f3fb81bc3fcb',
   '1422c07c-a3c5-40eb-be15-7aec17fc5ac8',
   '4740b7a1-56e8-4efe-b35f-0cf1927886cd'
 )
   and not exists (
     select 1 from public.attendance_records a where a.circle_id = circles.id
   );
