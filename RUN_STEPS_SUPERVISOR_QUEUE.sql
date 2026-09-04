drop policy if exists attendance_update_owner on public.attendance_records;

create policy attendance_update_owner_or_supervisor on public.attendance_records
  for update to authenticated
  using (
    exists (
      select 1 from public.circles c
       where c.id = attendance_records.circle_id
         and (c.teacher_id = public.current_teacher_id()
              or public.can_supervise(c.academy_id))
    )
  )
  with check (
    exists (
      select 1 from public.circles c
       where c.id = attendance_records.circle_id
         and (c.teacher_id = public.current_teacher_id()
              or public.can_supervise(c.academy_id))
    )
  );

drop policy if exists attendance_delete_owner on public.attendance_records;

create policy attendance_delete_owner_or_supervisor on public.attendance_records
  for delete to authenticated
  using (
    exists (
      select 1 from public.circles c
       where c.id = attendance_records.circle_id
         and (c.teacher_id = public.current_teacher_id()
              or public.can_supervise(c.academy_id))
    )
  );

create or replace function public.reorder_queue(
  p_circle_id uuid, p_session_date date, p_student_ids uuid[]
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.circles c
     where c.id = p_circle_id
       and (c.teacher_id = public.current_teacher_id()
            or public.can_supervise(c.academy_id))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.attendance_records ar
     set queue_order = u.ord
    from unnest(p_student_ids) with ordinality as u(sid, ord)
   where ar.circle_id = p_circle_id
     and ar.session_date = p_session_date
     and ar.student_id = u.sid;
end
$$;
