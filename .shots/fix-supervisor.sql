create or replace function public.teacher_today_circles()
returns table (
  id                uuid,
  name              text,
  type              text,
  gender_category   text,
  start_time        time,
  timezone          text,
  registration_slug text,
  session_date      date,
  joined_count      bigint,
  academy_id        uuid
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.type, c.gender_category,
         c.start_time, c.timezone, c.registration_slug,
         (now() at time zone c.timezone)::date,
         count(ar.id),
         c.academy_id
    from public.circles c
    left join public.attendance_records ar
      on ar.circle_id    = c.id
     and ar.session_date = (now() at time zone c.timezone)::date
   where c.is_active
     and (c.teacher_id = public.current_teacher_id()
          or public.can_supervise(c.academy_id))
     and extract(dow from (now() at time zone c.timezone)::date)::smallint = any(c.days_of_week)
   group by c.id
   order by c.start_time;
$$;
