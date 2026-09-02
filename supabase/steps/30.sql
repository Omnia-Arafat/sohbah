create policy circles_select_own_or_staff on public.circles
  for select to authenticated
  using (teacher_id = public.current_teacher_id() or public.is_staff());
