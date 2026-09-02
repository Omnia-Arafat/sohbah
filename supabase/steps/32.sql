create policy students_select_staff on public.students
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1
        from public.attendance_records ar
        join public.circles c on c.id = ar.circle_id
       where ar.student_id  = students.id
         and c.teacher_id   = public.current_teacher_id()
         and c.academy_id   = students.academy_id
    )
  );
