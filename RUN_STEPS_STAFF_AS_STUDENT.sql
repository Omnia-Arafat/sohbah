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
