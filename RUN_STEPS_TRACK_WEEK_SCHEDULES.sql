alter table public.track_weeks
  add column if not exists meeting_weekday smallint
    check (meeting_weekday between 0 and 6),
  add column if not exists meeting_time text;

create or replace function public.my_track_schedules(
  p_student_id uuid,
  p_phone      text
)
returns table (
  enrollment_id  uuid,
  track_id       uuid,
  cohort_id      uuid,
  track_name     text,
  cohort_name    text,
  current_week   int,
  duration_weeks int,
  start_date     date
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_given   text;
begin
  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_given := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  if v_student.phone_key is null
     or char_length(v_given) < 9
     or (v_student.phone_key <> v_given
         and right(v_student.phone_key, 9) <> right(v_given, 9)) then
    raise exception 'phone_mismatch' using errcode = '42501';
  end if;

  return query
    select e.id,
           t.id,
           c.id,
           t.name_ar,
           c.name_ar,
           greatest(1, least(
             (((now() at time zone c.timezone)::date - c.start_date) / 7) + 1,
             t.duration_weeks))::int,
           t.duration_weeks,
           c.start_date
      from public.track_enrollments e
      join public.track_cohorts c on c.id = e.cohort_id
      join public.tracks t on t.id = c.track_id
     where e.student_id = p_student_id
       and e.status in ('active', 'warned')
     order by e.joined_at;
end;
$$;

revoke all on function public.my_track_schedules(uuid, text) from public;
grant execute on function public.my_track_schedules(uuid, text) to anon, authenticated;

update public.academies
   set primary_color = '#2F7D32'
 where slug = 'sohbah';
