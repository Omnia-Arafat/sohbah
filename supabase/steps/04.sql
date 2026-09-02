create function public.attendance_report(
  p_from        date,
  p_to          date,
  p_gender      text default null,
  p_circle_id   uuid default null,
  p_teacher_id  uuid default null,
  p_academy_id  uuid default null,

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
   where public.is_admin()
     and ar.session_date between p_from and p_to
     and (p_gender     is null or s.gender_category = p_gender)
     and (p_circle_id  is null or c.id              = p_circle_id)
     and (p_teacher_id is null or c.teacher_id      = p_teacher_id)
     and (p_academy_id is null or c.academy_id      = p_academy_id)
     and (p_circle_type is null or c.type           = p_circle_type)
   group by s.id, s.name, s.father_name, s.gender_category
   order by 6 desc, 5 desc, s.name;
$$;
