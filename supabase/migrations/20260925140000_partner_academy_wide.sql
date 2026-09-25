-- =============================================================================
-- Two corrections to the السرد functions.
--
-- 1. The placeholder father name. 172 of the academy's students carry a
--    literal "-" in `father_name`, left by the import that had to fill a NOT
--    NULL column. Printed beside a name it reads "سمر مجدي -", which looks
--    like broken data rather than a missing field. The TypeScript readers
--    already drop it (src/lib/cohort-dal.ts); these SQL ones did not, so the
--    dash came back on every screen they feed.
--
--    Fixed here rather than by an UPDATE over 172 live student records: a
--    display convention is reversible and that write is not.
--
-- 2. الرفيقة is chosen from the whole academy, not one cohort.
--
--    The first version offered her own دفعة only, on the reasoning that a
--    partner elsewhere would be on a different week of the schedule. The
--    academy's answer is that this is not a rule they keep — sisters pair up
--    across cohorts — so the list widens.
--
--    Each name now carries its cohort and track, because two students can
--    share a name and the دفعة is what tells them apart.
-- =============================================================================

create or replace function public.real_father_name(p_value text)
returns text
language sql immutable
as $$
  select nullif(nullif(btrim(coalesce(p_value, '')), '-'), '—');
$$;

comment on function public.real_father_name(text) is
  'A father name, or NULL when the stored value is the import''s "-" placeholder.';

-- --- الرفيقة: the whole academy ---------------------------------------------

create or replace function public.my_partner_options(
  p_student_id uuid,
  p_phone      text
)
returns table (
  enrollment_id uuid,
  student_name  text,
  father_name   text,
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
           public.real_father_name(s.father_name),
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
       and e.id <> v_mine
       and e.status in ('active', 'warned')
     -- Her own دفعة first: widening the list is not the same as burying the
     -- names she is most likely to want.
     order by (e.cohort_id = v_cohort) desc, s.name;
end
$$;

revoke execute on function public.my_partner_options(uuid, text) from public;
grant  execute on function public.my_partner_options(uuid, text) to anon, authenticated;

-- --- The day board: same placeholder, same fix ------------------------------

create or replace function public.cohort_day_reports(
  p_cohort_id uuid,
  p_date      date
)
returns table (
  enrollment_id uuid,
  student_name  text,
  father_name   text,
  partner_name  text,
  reported      boolean,
  recited_new    boolean,
  recited_review boolean,
  heard_recitation      boolean,
  prayed_with_memorised boolean
)
language sql stable security definer set search_path = public
as $$
  select e.id,
         s.name,
         public.real_father_name(s.father_name),
         coalesce(
           r.partner_name,
           (select coalesce(p.external_name, ps.name)
              from public.track_partners p
              left join public.track_enrollments pe on pe.id = p.partner_enrollment_id
              left join public.students ps on ps.id = pe.student_id
             where p.enrollment_id = e.id and p.active_to is null
             limit 1)
         ),
         r.id is not null,
         coalesce(r.recited_new, false),
         coalesce(r.recited_review, false),
         coalesce(r.heard_recitation, false),
         coalesce(r.prayed_with_memorised, false)
    from public.track_enrollments e
    join public.students s on s.id = e.student_id
    join public.track_cohorts c on c.id = e.cohort_id
    left join public.track_day_reports r
           on r.enrollment_id = e.id and r.session_date = p_date
   where e.cohort_id = p_cohort_id
     and e.status in ('active', 'warned')
     and exists (
       select 1 from public.teachers t
        where t.academy_id = c.academy_id
          and t.auth_user_id = auth.uid()
          and t.is_active
     )
   order by s.name;
$$;

revoke execute on function public.cohort_day_reports(uuid, date) from public;
grant  execute on function public.cohort_day_reports(uuid, date) to authenticated;

-- --- The excuse queue: same -------------------------------------------------

create or replace function public.pending_excuses(p_academy_id uuid)
returns table (
  request_id    uuid,
  student_name  text,
  father_name   text,
  absence_date  date,
  reason        text,
  cohort_name   text,
  track_name    text,
  asked_at      timestamptz
)
language sql stable security definer set search_path = public
as $$
  select r.id, s.name, public.real_father_name(s.father_name),
         r.absence_date, r.reason, c.name_ar, t.name_ar, r.created_at
    from public.track_excuse_requests r
    join public.students s on s.id = r.student_id
    join public.track_enrollments e on e.id = r.enrollment_id
    join public.track_cohorts c on c.id = e.cohort_id
    join public.tracks t on t.id = c.track_id
   where c.academy_id = p_academy_id
     and r.status = 'pending'
     and exists (
       select 1 from public.teachers te
        where te.academy_id = p_academy_id
          and te.auth_user_id = auth.uid()
          and te.is_active
     )
   order by r.absence_date desc, r.created_at;
$$;

revoke execute on function public.pending_excuses(uuid) from public;
grant  execute on function public.pending_excuses(uuid) to authenticated;
