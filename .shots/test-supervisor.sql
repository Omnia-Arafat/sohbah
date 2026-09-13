begin;

create temp table proof (
  stage    text,
  who      text,
  teacher  uuid,
  circles  bigint
) on commit drop;

do $$
declare r record;
begin
  for r in
    select t.name, t.auth_user_id
      from public.teachers t
     where t.academy_id = '1bbbeae7-9479-48a0-a67f-6075ffb8ad10'
       and t.roles && array['supervisor']::text[]
       and t.auth_user_id is not null
     order by t.name
  loop
    perform set_config('request.jwt.claims',
                       json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text,
                       true);
    insert into proof
    select '1 قبل', r.name, public.current_teacher_id(), count(*)
      from public.teacher_today_circles();
  end loop;
end $$;

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

do $$
declare r record;
begin
  for r in
    select t.name, t.auth_user_id
      from public.teachers t
     where t.academy_id = '1bbbeae7-9479-48a0-a67f-6075ffb8ad10'
       and t.roles && array['supervisor']::text[]
       and t.auth_user_id is not null
     order by t.name
  loop
    perform set_config('request.jwt.claims',
                       json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text,
                       true);
    insert into proof
    select '2 بعد', r.name, public.current_teacher_id(), count(*)
      from public.teacher_today_circles();
  end loop;
end $$;

do $$
declare r record;
begin
  for r in
    select t.name, t.auth_user_id
      from public.teachers t
     where t.academy_id = '1bbbeae7-9479-48a0-a67f-6075ffb8ad10'
       and t.roles = array['teacher']::text[]
       and t.auth_user_id is not null
     order by t.name
     limit 3
  loop
    perform set_config('request.jwt.claims',
                       json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text,
                       true);
    insert into proof
    select '3 معلمة بعد', r.name, public.current_teacher_id(), count(*)
      from public.teacher_today_circles();
  end loop;
end $$;

select set_config('request.jwt.claims', null, true);

select * from proof order by stage, who;

rollback;
