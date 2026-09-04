drop policy if exists circles_insert_own on public.circles;

create policy circles_insert_own_or_supervisor on public.circles
  for insert to authenticated
  with check (
    teacher_id = public.current_teacher_id()
    or public.can_supervise(academy_id)
  );
