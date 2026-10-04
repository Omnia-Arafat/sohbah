begin;

create or replace function public.staff_existing_student(p_teacher_id uuid)
returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare
  v_teacher public.teachers%rowtype;
  v_found   uuid[];
begin
  select * into v_teacher from public.teachers t where t.id = p_teacher_id;
  if not found or public.normalize_phone(v_teacher.phone) is null then
    return null;
  end if;

  select array_agg(s.id) into v_found
    from public.students s
   where s.academy_id = v_teacher.academy_id
     and s.teacher_id is null
     and s.phone_key is not null
     and right(s.phone_key, 9) = right(regexp_replace(v_teacher.phone, '\D', '', 'g'), 9)
     and s.search_key like '%' || public.normalize_ar(btrim(v_teacher.name)) || '%';

  if coalesce(array_length(v_found, 1), 0) = 1 then
    return v_found[1];
  end if;
  return null;
end
$$;

revoke execute on function public.staff_existing_student(uuid) from public, anon, authenticated;

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
  v_teacher  public.teachers%rowtype;
  v_student  public.students%rowtype;
  v_existing uuid;
begin
  select * into v_teacher from public.teachers t
   where t.auth_user_id = auth.uid() and t.is_active;
  if not found then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  select * into v_student from public.students s where s.teacher_id = v_teacher.id;

  if not found then
    v_existing := public.staff_existing_student(v_teacher.id);
    if v_existing is not null then
      update public.students s set teacher_id = v_teacher.id where s.id = v_existing
      returning * into v_student;
    else
      if public.normalize_phone(v_teacher.phone) is null then
        raise exception 'staff_phone_missing' using errcode = 'P0001';
      end if;

      insert into public.students (name, father_name, phone, gender_category, academy_id, teacher_id)
      values (v_teacher.name, '-', v_teacher.phone, v_teacher.gender_category, v_teacher.academy_id, v_teacher.id)
      returning * into v_student;
    end if;
  end if;

  return query
    select v_student.id, v_student.name, v_student.father_name, v_student.gender_category::text;
end
$$;

create or replace function public.staff_as_student(p_teacher_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_teacher  public.teachers%rowtype;
  v_id       uuid;
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

  v_id := public.staff_existing_student(v_teacher.id);
  if v_id is not null then
    update public.students set teacher_id = v_teacher.id where id = v_id;
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

commit;
