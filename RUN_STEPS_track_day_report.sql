create table if not exists public.track_day_reports (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.track_enrollments(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  session_date  date not null,

  recited_new    boolean not null default false,  -- سرد مقرر الحفظ
  recited_review boolean not null default false,  -- سرد مقرر المراجعة

  heard_recitation      boolean not null default false,  -- سماع الورد من شيخ متقن
  prayed_with_memorised boolean not null default false,  -- الصلاة بالمحفوظ

  partner_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_day_report unique (enrollment_id, session_date)
);

create index if not exists idx_track_day_reports_student
  on public.track_day_reports (student_id, session_date desc);
create index if not exists idx_track_day_reports_enrollment
  on public.track_day_reports (enrollment_id, session_date desc);

comment on table public.track_day_reports is
  'بطاقة تتميم الورد: the student''s own four answers about one day, with the رفيقة''s name as it stood that day.';

alter table public.track_recitations
  drop constraint if exists uq_recitation_per_day;

alter table public.track_recitations
  add constraint uq_recitation_per_day_kind
  unique (enrollment_id, session_date, kind);

create or replace function public.track_day_is_open(
  p_enrollment_id uuid,
  p_session_date  date
)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_session_date <= (now() at time zone c.timezone)::date
     and p_session_date
         > ((now() at time zone c.timezone)::date
            - ((((now() at time zone c.timezone)::date - c.start_date) % 7) + 1))
    from public.track_enrollments e
    join public.track_cohorts c on c.id = e.cohort_id
   where e.id = p_enrollment_id;
$$;

comment on function public.track_day_is_open(uuid, date) is
  'Whether a day may still be reported: from the cohort''s most recent لقاء up to today, in the cohort''s own timezone. Earlier weeks were reviewed at their لقاء and are closed.';

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
  prayed_with_memorised boolean
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
             t.duration_weeks
        from public.track_enrollments e
        join public.track_cohorts c on c.id = e.cohort_id
        join public.tracks t on t.id = c.track_id
       where e.student_id = p_student_id
         and e.status in ('active', 'warned')
       limit 1
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
           (select p.external_name
              from public.track_partners p
             where p.enrollment_id = s.enrollment_id
               and p.active_to is null
             limit 1),
           d.day::date,
           d.day::date = s.today,
           d.day::date = s.meeting_day,
           coalesce(r.recited_new, false),
           coalesce(r.recited_review, false),
           coalesce(r.heard_recitation, false),
           coalesce(r.prayed_with_memorised, false)
      from span s
      cross join lateral generate_series(s.meeting_day, s.meeting_day + 6, interval '1 day') as d(day)
      left join public.track_day_reports r
             on r.enrollment_id = s.enrollment_id
            and r.session_date = d.day::date
     order by d.day;
end
$$;

revoke execute on function public.my_track_week(uuid, text) from public;
grant  execute on function public.my_track_week(uuid, text) to anon, authenticated;

create or replace function public.report_track_day(
  p_student_id uuid,
  p_phone      text,
  p_session_date date,
  p_recited_new    boolean,
  p_recited_review boolean,
  p_heard          boolean,
  p_prayed         boolean
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

  select e.id into v_enrollment
    from public.track_enrollments e
   where e.student_id = p_student_id
     and e.status in ('active', 'warned')
   limit 1;

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

revoke execute on function public.report_track_day(uuid, text, date, boolean, boolean, boolean, boolean) from public;
grant  execute on function public.report_track_day(uuid, text, date, boolean, boolean, boolean, boolean) to anon, authenticated;

alter table public.track_day_reports enable row level security;

create policy day_reports_staff on public.track_day_reports
  for all
  using (
    exists (
      select 1
        from public.track_enrollments e
        join public.track_cohorts c on c.id = e.cohort_id
        join public.teachers t on t.academy_id = c.academy_id
       where e.id = track_day_reports.enrollment_id
         and t.auth_user_id = auth.uid()
         and t.is_active
    )
  )
  with check (
    exists (
      select 1
        from public.track_enrollments e
        join public.track_cohorts c on c.id = e.cohort_id
        join public.teachers t on t.academy_id = c.academy_id
       where e.id = track_day_reports.enrollment_id
         and t.auth_user_id = auth.uid()
         and t.is_active
    )
  );

revoke all on public.track_day_reports from anon, authenticated;
