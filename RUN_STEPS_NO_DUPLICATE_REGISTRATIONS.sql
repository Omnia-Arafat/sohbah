begin;

create or replace function public.register_teacher(
  p_academy_id uuid,
  p_name       text,
  p_phone      text,
  p_role       text,
  p_gender     text default 'female'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_role  text := p_role;
  v_key   text;
begin
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  v_key := public.normalize_phone(v_phone);
  if v_key is null or char_length(v_key) < 9 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  if v_role = 'admin' then
    v_role := 'supervisor';
  end if;

  if v_role not in ('teacher', 'supervisor') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if p_gender not in ('male', 'female') then
    raise exception 'invalid_gender' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.academies a where a.id = p_academy_id and a.is_active
  ) then
    raise exception 'academy_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('register_teacher:' || p_academy_id::text));

  if exists (
    select 1 from public.teachers t
     where t.academy_id = p_academy_id
       and t.phone_key is not null
       and right(t.phone_key, 9) = right(v_key, 9)
  ) then
    raise exception 'phone_taken' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.teachers t
     where t.academy_id = p_academy_id
       and public.normalize_ar(t.name) = public.normalize_ar(v_name)
  ) then
    raise exception 'name_taken' using errcode = '23505';
  end if;

  insert into public.teachers (
    academy_id, name, phone, gender_category, roles, is_active, auth_user_id
  )
  values (
    p_academy_id, v_name, v_phone, p_gender,
    case
      when v_role = 'supervisor' then array['teacher', 'supervisor']
      else array['teacher']
    end,
    false, null
  );

exception
  when unique_violation then
    if sqlerrm = 'name_taken' then
      raise;
    end if;
    raise exception 'phone_taken' using errcode = '23505';
end
$$;

create or replace function public.refuse_duplicate_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := public.normalize_phone(new.phone);
begin
  if new.teacher_id is not null or v_key is null or char_length(v_key) < 9 then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('register_student:' || new.academy_id::text));

  if exists (
    select 1 from public.students s
     where s.academy_id = new.academy_id
       and s.phone_key is not null
       and right(s.phone_key, 9) = right(v_key, 9)
       and public.normalize_ar(s.name) = public.normalize_ar(new.name)
  ) then
    raise exception 'student_exists' using errcode = '23505';
  end if;

  return new;
end
$$;

drop trigger if exists trg_students_no_duplicate on public.students;
create trigger trg_students_no_duplicate
  before insert on public.students
  for each row execute function public.refuse_duplicate_student();

commit;
