-- Report on recitation, not attendance.
--
-- Joining the queue is now the attendance mark (see the previous migration), so
-- `sessions_present` counted the same thing as `sessions_joined` and the
-- present/absent/unmarked split carried no information.
--
-- The question the report actually needs to answer is the one attendance can no
-- longer express: a student turned up and took a place in the order, but the
-- session ended without them reciting. That is `recitation_status <> 'done'`.
--
-- Return type changes, so drop + recreate, then re-grant.

-- The 6-arg form from 20260810000000; the 7-arg drop makes this re-runnable.
drop function if exists public.attendance_report(date, date, text, uuid, uuid, uuid);
drop function if exists public.attendance_report(date, date, text, uuid, uuid, uuid, text);

create function public.attendance_report(
  p_from        date,
  p_to          date,
  p_gender      text default null,
  p_circle_id   uuid default null,
  p_teacher_id  uuid default null,
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
         -- 'waiting' and 'reciting' both mean the session ended without a
         -- finished recitation; only 'done' counts as recited.
         count(*) filter (where ar.recitation_status is distinct from 'done')
    from public.attendance_records ar
    join public.students s on s.id = ar.student_id
    join public.circles  c on c.id = ar.circle_id
   where public.is_admin()                      -- non-admins get an empty result
     and ar.session_date between p_from and p_to
     and (p_gender     is null or s.gender_category = p_gender)
     and (p_circle_id  is null or c.id              = p_circle_id)
     and (p_teacher_id is null or c.teacher_id      = p_teacher_id)
     and (p_academy_id is null or c.academy_id      = p_academy_id)
     and (p_circle_type is null or c.type           = p_circle_type)
   group by s.id, s.name, s.father_name, s.gender_category
   order by 6 desc, 5 desc, s.name;
$$;

revoke execute on function public.attendance_report(date, date, text, uuid, uuid, uuid, text) from public;
revoke execute on function public.attendance_report(date, date, text, uuid, uuid, uuid, text) from anon;
grant  execute on function public.attendance_report(date, date, text, uuid, uuid, uuid, text) to authenticated;
