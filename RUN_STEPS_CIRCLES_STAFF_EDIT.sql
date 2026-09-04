create or replace function public.is_staff_of(p_academy_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teachers
     where auth_user_id = auth.uid()
       and is_active
       and academy_id = p_academy_id
  )
$$;

comment on function public.is_staff_of(uuid) is
  'Any approved teacher or supervisor of that one academy.';

revoke execute on function public.is_staff_of(uuid) from public;
grant  execute on function public.is_staff_of(uuid) to authenticated;

drop policy if exists circles_update_own_or_admin on public.circles;

create policy circles_update_staff on public.circles
  for update to authenticated
  using (public.is_staff_of(academy_id))
  with check (public.is_staff_of(academy_id));
