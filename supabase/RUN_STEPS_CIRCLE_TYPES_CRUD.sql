create policy circle_types_admin_delete on public.circle_types
  for delete to authenticated
  using (public.is_admin_of(academy_id));
