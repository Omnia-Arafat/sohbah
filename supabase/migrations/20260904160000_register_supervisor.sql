-- The application form offered "معلمة" or "مشرفة" and stored the second one as
-- `admin` — the only non-teacher value the old single-role column had. So
-- everyone who applied as a مشرفة was created with full admin rights: able to
-- approve staff, reset passwords and delete circles.
--
-- Now that `supervisor` exists, the form stores what it says.
--
-- Only new applications are affected. Existing rows are not touched by this
-- migration; the people already created this way were corrected by hand.

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
begin
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if public.normalize_phone(v_phone) is null then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  -- A form still open in someone's browser posts the old value. It always
  -- meant مشرفة on screen, so read it as that rather than failing an
  -- application that was filled in correctly.
  if v_role = 'admin' then
    v_role := 'supervisor';
  end if;

  -- Nobody applies to be an admin. That is granted from the staff screen.
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

  -- `role` is left to the trigger, which derives it from `roles`.
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
    raise exception 'phone_taken' using errcode = '23505';
end
$$;
