create policy teachers_select_self_or_staff on public.teachers
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_staff());
