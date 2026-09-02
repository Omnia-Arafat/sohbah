-- The application form asks for name, role and phone — nothing else.
--
-- `p_gender` was the odd one out: `teachers.gender_category` is NOT NULL, but
-- unlike the equivalent column on `students` and `circles` it gates nothing.
-- No RLS policy reads it, `enforce_gender_match()` does not consult it, and no
-- RPC filters on it — it is display-only in the admin list. Asking an applicant
-- for it to satisfy a constraint was the tail wagging the dog.
--
-- It now defaults, and an admin can correct it on the teacher edit screen. The
-- default is 'female' because this academy's teaching staff is female; change
-- the literal below if that stops being true.
--
-- Signature is unchanged (same argument types in the same order), so this is a
-- plain replace and existing grants carry over.
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
begin
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if public.normalize_phone(v_phone) is null then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  -- 'admin' here is the مشرفة role people apply for. It still grants nothing
  -- until an admin approves the row *and* links an Auth user by hand.
  if p_role not in ('teacher', 'admin') then
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

  insert into public.teachers (
    academy_id, name, phone, gender_category, role, is_active, auth_user_id
  )
  values (p_academy_id, v_name, v_phone, p_gender, p_role, false, null);

exception
  when unique_violation then
    raise exception 'phone_taken' using errcode = '23505';
end
$$;
