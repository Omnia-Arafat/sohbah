-- A supervisor could not create a circle for one of her teachers.
--
-- `circles_insert_own` only ever allowed a row whose `teacher_id` is the
-- caller's own, or an admin's row for anyone. A مشرفة is neither, so the form
-- came back with "ملكيش صلاحية" — even though she is allowed to *edit* that
-- same circle a moment later (`circles_update_own_or_supervisor`).
--
-- Insert now matches update: your own, or anyone's if you supervise that
-- academy.

drop policy if exists circles_insert_own on public.circles;

create policy circles_insert_own_or_supervisor on public.circles
  for insert to authenticated
  with check (
    teacher_id = public.current_teacher_id()
    or public.can_supervise(academy_id)
  );
