-- A student on more than one مسار.
--
-- "لا يُسمح بالاشتراك في أكثر من مسار" was the academy's rule when tracks
-- shipped, enforced by uq_one_active_track_per_student. It no longer is:
-- students are on several tracks at once. Everything a track records is
-- already keyed by the ENROLLMENT (day reports, partners, excuses, scores),
-- so no data moves; what changes is the rule and the functions that found
-- "her track" with `limit 1`.
--
--   1. The two one-per-student indexes go. In their place, a trigger keeps a
--      student from holding two places on the SAME track (two cohorts of it).
--   2. student_enrollment() picks which of her enrollments a call means: the
--      one asked for, or, when none is named, the one it always picked — so a
--      page still cached on her phone keeps working.
--   3. my_track_week returns every track she is on, not the first.
--   4. report_track_day, ask_for_excuse, my_partner_options and
--      set_my_partner take an optional p_enrollment_id. Their argument lists
--      change, so each is dropped and created again; all of it is inside one
--      transaction, so no caller ever finds one missing.
--
-- Bodies are otherwise copied from 20261004120000 (my_track_week),
-- 20260925100000 (report_track_day, ask_for_excuse) and 20260927100000
-- (my_partner_options, set_my_partner).

begin;

-- --- 1. The rule ------------------------------------------------------------

drop index if exists public.uq_one_active_track_per_student;
drop index if exists public.uq_one_open_application_per_student;

create or replace function public.track_enrollment_one_per_track()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status in ('active', 'warned', 'pending', 'waitlisted') and exists (
    select 1
      from public.track_enrollments e
      join public.track_cohorts c  on c.id = e.cohort_id
      join public.track_cohorts nc on nc.id = new.cohort_id
     where e.student_id = new.student_id
       and e.id <> new.id
       and c.track_id = nc.track_id
       and e.status in ('active', 'warned', 'pending', 'waitlisted')
  ) then
    -- 23505 like the index it replaces, so callers that read it as "already
    -- on a track" keep reading it right.
    raise exception 'already_on_this_track' using errcode = '23505';
  end if;
  return new;
end
$$;

drop trigger if exists trg_track_enrollment_one_per_track on public.track_enrollments;
create trigger trg_track_enrollment_one_per_track
  before insert or update of status, cohort_id, student_id on public.track_enrollments
  for each row execute function public.track_enrollment_one_per_track();

-- --- 2. Which enrollment a call means ---------------------------------------

create or replace function public.student_enrollment(p_student_id uuid, p_enrollment_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select e.id
    from public.track_enrollments e
   where e.student_id = p_student_id
     and e.status in ('active', 'warned')
     and (p_enrollment_id is null or e.id = p_enrollment_id)
   order by e.joined_at nulls last, e.requested_at
   limit 1;
$$;

revoke execute on function public.student_enrollment(uuid, uuid) from public, anon, authenticated;

-- --- 3. Her week, on every track --------------------------------------------

create or replace function public.my_track_week(
  p_student_id uuid,
  p_phone      text
)
returns table (
  enrollment_id uuid,
  cohort_name   text,
  track_name    text,
  week_number   int,
  partner_name  text,
  session_date  date,
  is_today      boolean,
  is_meeting    boolean,
  recited_new    boolean,
  recited_review boolean,
  heard_recitation      boolean,
  prayed_with_memorised boolean,
  reported_at   timestamptz,
  teacher_name  text,
  duration_weeks int
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_given   text;
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

  return query
    with mine as (
      select e.id as enrollment_id, c.id as cohort_id, c.name_ar as cohort_name,
             t.name_ar as track_name, c.start_date, c.timezone,
             t.duration_weeks, tt.name as teacher_name, e.joined_at
        from public.track_enrollments e
        join public.track_cohorts c on c.id = e.cohort_id
        join public.tracks t on t.id = c.track_id
        left join public.teachers tt on tt.id = c.teacher_id
       where e.student_id = p_student_id
         and e.status in ('active', 'warned')
    ),
    span as (
      select m.*,
             (now() at time zone m.timezone)::date as today,
             (now() at time zone m.timezone)::date
               - (((now() at time zone m.timezone)::date - m.start_date) % 7)
               as meeting_day
        from mine m
    )
    select s.enrollment_id,
           s.cohort_name,
           s.track_name,
           least(((s.today - s.start_date) / 7)::int + 1, s.duration_weeks),
           (select coalesce(p.external_name, ps.name)
              from public.track_partners p
              left join public.track_enrollments pe on pe.id = p.partner_enrollment_id
              left join public.students ps on ps.id = pe.student_id
             where p.enrollment_id = s.enrollment_id
               and p.active_to is null
             limit 1),
           d.day::date,
           d.day::date = s.today,
           d.day::date = s.meeting_day,
           coalesce(r.recited_new, false),
           coalesce(r.recited_review, false),
           coalesce(r.heard_recitation, false),
           coalesce(r.prayed_with_memorised, false),
           r.updated_at,
           s.teacher_name,
           s.duration_weeks
      from span s
      cross join lateral generate_series(s.meeting_day, s.meeting_day + 6, interval '1 day') as d(day)
      left join public.track_day_reports r
             on r.enrollment_id = s.enrollment_id
            and r.session_date = d.day::date
     -- Oldest enrollment first, so the track she joined first stays first.
     order by s.joined_at nulls last, s.enrollment_id, d.day;
end
$$;

revoke execute on function public.my_track_week(uuid, text) from public;
grant  execute on function public.my_track_week(uuid, text) to anon, authenticated;

-- --- 4. The four that act on one track ---------------------------------------

drop function if exists public.report_track_day(uuid, text, date, boolean, boolean, boolean, boolean);

create function public.report_track_day(
  p_student_id uuid,
  p_phone      text,
  p_session_date date,
  p_recited_new    boolean,
  p_recited_review boolean,
  p_heard          boolean,
  p_prayed         boolean,
  p_enrollment_id  uuid default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_student    public.students%rowtype;
  v_given      text;
  v_enrollment uuid;
  v_partner    text;
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

  v_enrollment := public.student_enrollment(p_student_id, p_enrollment_id);

  if v_enrollment is null then
    raise exception 'not_on_a_track' using errcode = 'P0002';
  end if;

  if not public.track_day_is_open(v_enrollment, p_session_date) then
    raise exception 'day_closed' using errcode = '42501';
  end if;

  select coalesce(p.external_name, s2.name) into v_partner
    from public.track_partners p
    left join public.track_enrollments pe on pe.id = p.partner_enrollment_id
    left join public.students s2 on s2.id = pe.student_id
   where p.enrollment_id = v_enrollment
     and p.active_to is null
   limit 1;

  insert into public.track_day_reports as r (
    enrollment_id, student_id, session_date,
    recited_new, recited_review, heard_recitation, prayed_with_memorised,
    partner_name
  )
  values (
    v_enrollment, p_student_id, p_session_date,
    coalesce(p_recited_new, false), coalesce(p_recited_review, false),
    coalesce(p_heard, false), coalesce(p_prayed, false),
    v_partner
  )
  on conflict (enrollment_id, session_date) do update
     set recited_new           = excluded.recited_new,
         recited_review        = excluded.recited_review,
         heard_recitation      = excluded.heard_recitation,
         prayed_with_memorised = excluded.prayed_with_memorised,
         partner_name          = coalesce(excluded.partner_name, r.partner_name),
         updated_at            = now();
end
$$;

revoke execute on function public.report_track_day(uuid, text, date, boolean, boolean, boolean, boolean, uuid) from public;
grant  execute on function public.report_track_day(uuid, text, date, boolean, boolean, boolean, boolean, uuid) to anon, authenticated;

drop function if exists public.ask_for_excuse(uuid, text, date, text);

create function public.ask_for_excuse(
  p_student_id uuid,
  p_phone      text,
  p_date       date,
  p_reason     text,
  p_enrollment_id uuid default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_given   text;
  v_mine    uuid;
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

  v_mine := public.student_enrollment(p_student_id, p_enrollment_id);

  if v_mine is null then
    raise exception 'not_on_a_track' using errcode = 'P0002';
  end if;

  if p_date > (now() at time zone 'Africa/Cairo')::date then
    raise exception 'day_in_future' using errcode = '22023';
  end if;

  insert into public.track_excuse_requests (enrollment_id, student_id, absence_date, reason)
  values (v_mine, p_student_id, p_date, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (enrollment_id, absence_date) do update
     set reason = excluded.reason,
         status = 'pending',
         decided_by = null,
         decided_at = null;
end
$$;

revoke execute on function public.ask_for_excuse(uuid, text, date, text, uuid) from public;
grant  execute on function public.ask_for_excuse(uuid, text, date, text, uuid) to anon, authenticated;

drop function if exists public.my_partner_options(uuid, text);

create function public.my_partner_options(
  p_student_id uuid,
  p_phone      text,
  p_enrollment_id uuid default null
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

  v_mine := public.student_enrollment(p_student_id, p_enrollment_id);

  if v_mine is null then
    return;
  end if;

  select e.cohort_id, c.academy_id
    into v_cohort, v_academy
    from public.track_enrollments e
    join public.track_cohorts c on c.id = e.cohort_id
   where e.id = v_mine;

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
       -- None of her own enrollments: she may now hold several.
       and e.student_id <> p_student_id
       and e.status in ('active', 'warned')
     order by (e.cohort_id = v_cohort) desc, s.name;
end
$$;

revoke execute on function public.my_partner_options(uuid, text, uuid) from public;
grant  execute on function public.my_partner_options(uuid, text, uuid) to anon, authenticated;

drop function if exists public.set_my_partner(uuid, text, uuid, text);

create function public.set_my_partner(
  p_student_id uuid,
  p_phone      text,
  p_partner_enrollment_id uuid,
  p_external_name text,
  p_enrollment_id uuid default null
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

  v_mine := public.student_enrollment(p_student_id, p_enrollment_id);

  if v_mine is null then
    raise exception 'not_on_a_track' using errcode = 'P0002';
  end if;

  v_name := nullif(btrim(coalesce(p_external_name, '')), '');

  if (p_partner_enrollment_id is not null) = (v_name is not null) then
    raise exception 'pick_one_partner' using errcode = '22023';
  end if;

  if p_partner_enrollment_id is not null and exists (
    select 1 from public.track_enrollments e
     where e.id = p_partner_enrollment_id and e.student_id = p_student_id
  ) then
    raise exception 'partner_is_self' using errcode = '22023';
  end if;

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

  update public.track_partners
     set active_to = current_date
   where enrollment_id = v_mine
     and active_to is null;

  insert into public.track_partners (enrollment_id, partner_enrollment_id, external_name)
  values (v_mine, p_partner_enrollment_id, v_name);
end
$$;

revoke execute on function public.set_my_partner(uuid, text, uuid, text, uuid) from public;
grant  execute on function public.set_my_partner(uuid, text, uuid, text, uuid) to anon, authenticated;

commit;
