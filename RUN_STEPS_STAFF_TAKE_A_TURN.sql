alter table public.students
  add column if not exists teacher_id uuid
    references public.teachers(id) on delete set null;

create unique index if not exists idx_students_teacher_id
  on public.students (teacher_id)
  where teacher_id is not null;

create or replace function public.staff_student_record()
returns table (
  id              uuid,
  name            text,
  father_name     text,
  gender_category text
)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_teacher public.teachers%rowtype;
  v_student public.students%rowtype;
begin
  select * into v_teacher from public.teachers t
   where t.auth_user_id = auth.uid() and t.is_active;
  if not found then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  select * into v_student from public.students s where s.teacher_id = v_teacher.id;

  if not found then
    if public.normalize_phone(v_teacher.phone) is null then
      raise exception 'staff_phone_missing' using errcode = 'P0001';
    end if;

    insert into public.students (name, father_name, phone, gender_category, academy_id, teacher_id)
    values (v_teacher.name, '-', v_teacher.phone, v_teacher.gender_category, v_teacher.academy_id, v_teacher.id)
    returning * into v_student;
  end if;

  return query
    select v_student.id, v_student.name, v_student.father_name, v_student.gender_category::text;
end
$$;

revoke execute on function public.staff_student_record() from public;
grant  execute on function public.staff_student_record() to authenticated;

comment on function public.staff_student_record() is
  'The signed-in معلمة''s own student row, created on first use, so she can take a turn in a حلقة.';
