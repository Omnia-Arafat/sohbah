-- Editing a circle is opened from "its own teacher, or an admin" to "any
-- approved member of that academy's staff".
--
-- The academy asked for this: the people who supervise the circles are stored
-- as ordinary teachers, because the third role (مشرفة) does not exist in the
-- schema yet, so there is no narrower group to grant it to. When that role is
-- added, this policy is what it replaces.
--
-- Two limits stay in place deliberately:
--   * DELETE is untouched — still the circle's own teacher or an admin. It is
--     the one action here that cannot be undone.
--   * Staff are scoped to their OWN academy. `is_staff()` alone would have let
--     a teacher in one academy edit another academy's circles, so this adds an
--     academy-aware variant rather than reusing it.

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

-- The WITH CHECK repeats the predicate against the row's academy_id after the
-- update, so a circle cannot be edited and moved into another academy.
drop policy if exists circles_update_own_or_admin on public.circles;

create policy circles_update_staff on public.circles
  for update to authenticated
  using (public.is_staff_of(academy_id))
  with check (public.is_staff_of(academy_id));
