alter table public.circles
  add column max_students int check (max_students is null or max_students > 0);
drop function if exists public.circle_public_info(text);
create function public.circle_public_info(p_slug text)
returns table (
  id              uuid,
  name            text,
  type            text,
  gender_category text,
  session_link    text,
  start_time      time,
  timezone        text,
  session_date    date,
  meets_today     boolean,
  academy_id      uuid,
  max_students    int
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.type, c.gender_category,
         c.session_link, c.start_time, c.timezone,
         (now() at time zone c.timezone)::date,
         extract(dow from (now() at time zone c.timezone)::date)::smallint = any(c.days_of_week),
         c.academy_id,
         c.max_students
    from public.circles c
   where c.registration_slug = p_slug and c.is_active;
$$;
revoke execute on function public.circle_public_info(text) from public;
grant  execute on function public.circle_public_info(text) to anon, authenticated;
create or replace function public.join_circle(p_slug text, p_student_id uuid)
returns table (attendance_id uuid, session_date date, queue_order int, already_joined boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_circle  public.circles%rowtype;
  v_student public.students%rowtype;
  v_date    date;
  v_row     public.attendance_records%rowtype;
  v_next    int;
  v_current int;
begin
  select * into v_circle from public.circles
   where registration_slug = p_slug and is_active;
  if not found then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;
  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;
  if v_student.gender_category is distinct from v_circle.gender_category then
    raise exception 'gender_mismatch' using errcode = '42501';
  end if;
  v_date := (now() at time zone v_circle.timezone)::date;
  select * into v_row
    from public.attendance_records ar
   where ar.student_id = p_student_id
     and ar.circle_id = v_circle.id
     and ar.session_date = v_date;
  if found then
    return query select v_row.id, v_row.session_date, v_row.queue_order, true;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext(v_circle.id::text || v_date::text));
  if v_circle.max_students is not null then
    select count(*) into v_current
      from public.attendance_records ar
     where ar.circle_id = v_circle.id and ar.session_date = v_date;
    if v_current >= v_circle.max_students then
      raise exception 'circle_full' using errcode = 'P0001';
    end if;
  end if;
  select coalesce(max(ar.queue_order), 0) + 1 into v_next
    from public.attendance_records ar
   where ar.circle_id = v_circle.id and ar.session_date = v_date;
  insert into public.attendance_records (student_id, circle_id, session_date, queue_order)
  values (p_student_id, v_circle.id, v_date, v_next)
  returning * into v_row;
  return query select v_row.id, v_row.session_date, v_row.queue_order, false;
end
$$;
