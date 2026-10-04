-- A معلمة, مشرفة or admin added to a track as a student.
--
-- ADDITIVE ONLY: one new function; nothing existing changes.
--
-- A cohort's roster is built from the students table, and a member of staff
-- has a student row only once she has taken a turn in a حلقة
-- (staff_student_record, 20260929100000). So a مشرفة who is also a student on
-- a track could not be added to its دفعة at all: «إضافة طالبات» never listed
-- her.
--
-- staff_as_student() is the same thing done by a مشرفة or admin on her behalf:
-- it returns the staff member's own student row, making it the first time —
-- her name, her phone, her side, linked by students.teacher_id, exactly as
-- staff_student_record() makes it. That row is what she then names with her
-- name and phone under «أنا كطالبة», so her ورد and her track find her.
--
-- Rollback:
--   drop function if exists public.staff_as_student(uuid);

begin;

create or replace function public.staff_as_student(p_teacher_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_teacher public.teachers%rowtype;
  v_id      uuid;
begin
  select * into v_teacher from public.teachers t where t.id = p_teacher_id;
  if not found then
    raise exception 'teacher_not_found' using errcode = 'P0002';
  end if;

  if not public.can_supervise(v_teacher.academy_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select s.id into v_id from public.students s where s.teacher_id = v_teacher.id;
  if v_id is not null then
    return v_id;
  end if;

  if public.normalize_phone(v_teacher.phone) is null then
    raise exception 'staff_phone_missing' using errcode = 'P0001';
  end if;

  insert into public.students (name, father_name, phone, gender_category, academy_id, teacher_id)
  values (v_teacher.name, '-', v_teacher.phone, v_teacher.gender_category, v_teacher.academy_id, v_teacher.id)
  returning id into v_id;

  return v_id;
end
$$;

revoke execute on function public.staff_as_student(uuid) from public, anon;
grant  execute on function public.staff_as_student(uuid) to authenticated;

commit;
