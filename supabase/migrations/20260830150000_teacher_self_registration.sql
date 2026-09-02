-- Teachers and supervisors apply for themselves; an admin approves.
--
-- Until now every teacher was created by hand in the SQL editor
-- (supabase/seed/first-admin.sql), which does not scale past the first few.
--
-- The applicant supplies a name and a phone number only. No login is created
-- here: `auth_user_id` stays null, and an admin still creates the Auth user and
-- links it once they have approved the person. That keeps this endpoint unable
-- to mint credentials, which matters because it is reachable without auth.

-- --- Contact details --------------------------------------------------------
alter table public.teachers
  add column if not exists phone text;

alter table public.teachers
  add column if not exists phone_key text
    generated always as (public.normalize_phone(phone)) stored;

-- Stops one person submitting the same application repeatedly, and makes the
-- phone the same identity key it is for students.
create unique index if not exists uq_teachers_phone_per_academy
  on public.teachers (academy_id, phone_key)
  where phone_key is not null;

-- --- Application endpoint ---------------------------------------------------
-- SECURITY DEFINER because `teachers_admin_insert` requires an existing admin,
-- which an applicant is not. The function is the whole trust boundary, so it
-- validates every field itself and hard-codes the two things that must never
-- come from the caller:
--
--   is_active   = false  -> the row grants nothing until an admin flips it
--   auth_user_id = null  -> no sign-in is attached, so 'admin' is inert here
--
-- A requested role of 'admin' is therefore a request, not a grant.
create or replace function public.register_teacher(
  p_academy_id uuid,
  p_name       text,
  p_phone      text,
  p_role       text,
  p_gender     text
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
  -- uq_teachers_phone_per_academy: someone already applied with this number.
  when unique_violation then
    raise exception 'phone_taken' using errcode = '23505';
end
$$;

revoke execute on function public.register_teacher(uuid, text, text, text, text) from public;
grant  execute on function public.register_teacher(uuid, text, text, text, text) to anon, authenticated;
