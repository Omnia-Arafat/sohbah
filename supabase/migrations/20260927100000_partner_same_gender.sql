-- الرفيقة stays on her own side.
--
-- The academy now runs men's circles beside the women's, and neither side may
-- see the other's names. my_partner_options listed every student on any track
-- in the academy, and set_my_partner accepted any enrollment id. Both now keep
-- to the caller's own gender_category.
--
-- NOT ADDITIVE: this replaces two existing functions (same signatures, same
-- grants, bodies copied from 20260925140000 and 20260925100000 with only the
-- gender condition added). No table, column or row changes. Safe to run while
-- circles are live. On 2026-09-27 no رفيقة had been chosen by anyone yet, so
-- no stored pairing crosses sides.

begin;

create or replace function public.my_partner_options(
  p_student_id uuid,
  p_phone      text
)
returns table (
  enrollment_id uuid,
  student_name  text,
  cohort_name   text,
  track_name    text,
  same_cohort   boolean,
  is_current    boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_given   text;
  v_mine    uuid;
  v_cohort  uuid;
  v_academy uuid;
begin
  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_given := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  if v_student.phone_key is null
     or char_length(v_given) < 9
     or (v_student.phone_key <> v_given
         and right(v_student.phone_key, 9) <> right(v_given, 9)) then
    raise exception 'phone_mismatch' using errcode = '42501';
  end if;

  select e.id, e.cohort_id, c.academy_id
    into v_mine, v_cohort, v_academy
    from public.track_enrollments e
    join public.track_cohorts c on c.id = e.cohort_id
   where e.student_id = p_student_id
     and e.status in ('active', 'warned')
   limit 1;

  if v_mine is null then
    return;
  end if;

  return query
    select e.id,
           s.name,
           c.name_ar,
           t.name_ar,
           e.cohort_id = v_cohort,
           exists (
             select 1 from public.track_partners p
              where p.enrollment_id = v_mine
                and p.active_to is null
                and p.partner_enrollment_id = e.id
           )
      from public.track_enrollments e
      join public.students s on s.id = e.student_id
      join public.track_cohorts c on c.id = e.cohort_id
      join public.tracks t on t.id = c.track_id
     where c.academy_id = v_academy
       and s.gender_category = v_student.gender_category
       and e.id <> v_mine
       and e.status in ('active', 'warned')
     -- Her own دفعة first: widening the list is not the same as burying the
     -- names she is most likely to want.
     order by (e.cohort_id = v_cohort) desc, s.name;
end
$$;

create or replace function public.set_my_partner(
  p_student_id uuid,
  p_phone      text,
  p_partner_enrollment_id uuid,
  p_external_name text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_given   text;
  v_mine    uuid;
  v_name    text;
begin
  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_given := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  if v_student.phone_key is null
     or char_length(v_given) < 9
     or (v_student.phone_key <> v_given
         and right(v_student.phone_key, 9) <> right(v_given, 9)) then
    raise exception 'phone_mismatch' using errcode = '42501';
  end if;

  select e.id into v_mine
    from public.track_enrollments e
   where e.student_id = p_student_id
     and e.status in ('active', 'warned')
   limit 1;

  if v_mine is null then
    raise exception 'not_on_a_track' using errcode = 'P0002';
  end if;

  v_name := nullif(btrim(coalesce(p_external_name, '')), '');

  -- The table's own rule, restated here so the error is a sentence rather
  -- than a constraint violation: one or the other, never both, never neither.
  if (p_partner_enrollment_id is not null) = (v_name is not null) then
    raise exception 'pick_one_partner' using errcode = '22023';
  end if;

  if p_partner_enrollment_id = v_mine then
    raise exception 'partner_is_self' using errcode = '22023';
  end if;

  -- Only someone on her own side: the options list is filtered the same way,
  -- and this is what makes that more than a display choice.
  if p_partner_enrollment_id is not null and not exists (
    select 1
      from public.track_enrollments e
      join public.students s on s.id = e.student_id
     where e.id = p_partner_enrollment_id
       and e.status in ('active', 'warned')
       and s.gender_category = v_student.gender_category
  ) then
    raise exception 'partner_not_available' using errcode = '42501';
  end if;

  -- History is kept, not overwritten: today's card should still name the
  -- رفيقة who heard it, long after a new one is chosen.
  update public.track_partners
     set active_to = current_date
   where enrollment_id = v_mine
     and active_to is null;

  insert into public.track_partners (enrollment_id, partner_enrollment_id, external_name)
  values (v_mine, p_partner_enrollment_id, v_name);
end
$$;

revoke execute on function public.my_partner_options(uuid, text) from public;
grant  execute on function public.my_partner_options(uuid, text) to anon, authenticated;
revoke execute on function public.set_my_partner(uuid, text, uuid, text) from public;
grant  execute on function public.set_my_partner(uuid, text, uuid, text) to anon, authenticated;

commit;
