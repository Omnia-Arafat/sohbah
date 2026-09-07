-- The reports filter used to offer a specific circle OR a single teacher,
-- which just duplicated each other (a circle's own label already names its
-- teacher) and confused people. It is now one filter: any number of
-- teachers, so it works for "everyone", "just her", or "these three" alike.
--
-- The per-circle filter is gone entirely; `p_teacher_id uuid` becomes
-- `p_teacher_ids uuid[]` so the same call can ask for several teachers at
-- once instead of the page issuing one request per teacher and merging them
-- itself. A changed parameter type is a new signature, so drop + recreate.

drop function if exists public.attendance_report(date, date, text, uuid, uuid, uuid, text);

create function public.attendance_report(
  p_from        date,
  p_to          date,
  p_gender      text default null,
  p_teacher_ids uuid[] default null,
  p_academy_id  uuid default null,
  -- Circle *type* (tasheeh / tajweed / free_recitation), not a specific circle:
  -- "how are the tajweed circles doing" is a different question from
  -- "how is Friday's tajweed circle doing".
  p_circle_type text default null
)
returns table (
  student_id           uuid,
  student_name         text,
  father_name          text,
  gender_category      text,
  sessions_joined      bigint,
  sessions_recited     bigint,
  sessions_not_recited bigint
)
language sql stable security definer set search_path = public
as $$
  select s.id, s.name, s.father_name, s.gender_category,
         count(*),
         count(*) filter (where ar.recitation_status =  'done'),
         count(*) filter (where ar.recitation_status is distinct from 'done')
    from public.attendance_records ar
    join public.students s on s.id = ar.student_id
    join public.circles  c on c.id = ar.circle_id
   where public.is_staff()                     -- non-staff get an empty result
     and ar.session_date between p_from and p_to
     and (p_gender      is null or s.gender_category = p_gender)
     and (p_teacher_ids is null or c.teacher_id      = any(p_teacher_ids))
     and (p_academy_id  is null or c.academy_id      = p_academy_id)
     and (p_circle_type is null or c.type            = p_circle_type)
   group by s.id, s.name, s.father_name, s.gender_category
   order by 6 desc, 5 desc, s.name;
$$;

revoke execute on function public.attendance_report(date, date, text, uuid[], uuid, text) from public;
revoke execute on function public.attendance_report(date, date, text, uuid[], uuid, text) from anon;
grant  execute on function public.attendance_report(date, date, text, uuid[], uuid, text) to authenticated;
