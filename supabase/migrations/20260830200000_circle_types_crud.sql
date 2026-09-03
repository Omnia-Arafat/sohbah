-- Full edit + delete for circle types, on top of the add/deactivate already in
-- place. Deactivating stays as it was — it is what protects a type still in
-- use by a circle, since deleting one out from under an existing circle would
-- either orphan it or (with the FK below) simply be refused.
--
-- No schema change is needed for editing a name: `circle_types_admin_update`
-- already allows a مشرفة to update any column on her academy's rows, name_ar
-- and name_en included — the app just did not expose it yet.
--
-- Deleting needs a policy that does not exist yet. `fk_circles_type` has no
-- ON DELETE clause, so it defaults to RESTRICT: the database itself refuses to
-- delete a type that any circle still references, before this policy is even
-- consulted. The app additionally hides the delete control for such a type
-- (see the circle-types page) so nobody has to discover that rule by hitting
-- an error — but the real guarantee against orphaning a circle is this FK, not
-- the UI.
create policy circle_types_admin_delete on public.circle_types
  for delete to authenticated
  using (public.is_admin_of(academy_id));
