  begin;
  
  alter table public.track_day_reports
    add column if not exists recorded_by uuid references public.teachers(id) on delete set null;
  
  comment on column public.track_day_reports.recorded_by is
    'The member of staff who wrote this card for the student; null when she wrote it herself.';
  
  create or replace function public.track_day_reports_recorded_by()
  returns trigger
  language plpgsql
  as $$
  begin
    if coalesce(current_setting('sohbah.staff_report', true), '') <> 'on' then
      new.recorded_by := null;
    end if;
    return new;
  end
  $$;
  
  drop trigger if exists track_day_reports_recorded_by on public.track_day_reports;
  create trigger track_day_reports_recorded_by
    before insert or update on public.track_day_reports
    for each row execute function public.track_day_reports_recorded_by();
  
  create or replace function public.staff_report_track_day(
    p_enrollment_id  uuid,
    p_session_date   date,
    p_recited_new    boolean,
    p_recited_review boolean,
    p_heard          boolean,
    p_prayed         boolean
  )
  returns void
  language plpgsql security definer set search_path = public
  as $$
  declare
    v_enrollment public.track_enrollments%rowtype;
    v_cohort     public.track_cohorts%rowtype;
    v_staff      uuid;
    v_partner    text;
  begin
    select * into v_enrollment from public.track_enrollments where id = p_enrollment_id;
    if not found then
      raise exception 'enrollment_not_found' using errcode = 'P0002';
    end if;
  
    select * into v_cohort from public.track_cohorts where id = v_enrollment.cohort_id;
  
    v_staff := public.current_teacher_id();
    if v_staff is null
       or not public.can_manage_cohort(v_cohort.id)
       or not public.staff_sees_gender(v_cohort.academy_id, v_cohort.gender_category) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  
    if v_enrollment.status not in ('active', 'warned') then
      raise exception 'not_on_a_track' using errcode = 'P0002';
    end if;
  
    if p_session_date is null
       or p_session_date < v_cohort.start_date
       or p_session_date > (now() at time zone v_cohort.timezone)::date then
      raise exception 'day_out_of_range' using errcode = '22023';
    end if;
  
    if not (coalesce(p_recited_new, false) or coalesce(p_recited_review, false)
            or coalesce(p_heard, false) or coalesce(p_prayed, false)) then
      delete from public.track_day_reports
       where enrollment_id = v_enrollment.id and session_date = p_session_date;
      return;
    end if;
  
    select coalesce(p.external_name, s2.name) into v_partner
      from public.track_partners p
      left join public.track_enrollments pe on pe.id = p.partner_enrollment_id
      left join public.students s2 on s2.id = pe.student_id
     where p.enrollment_id = v_enrollment.id
       and p.active_to is null
     limit 1;
  
    perform set_config('sohbah.staff_report', 'on', true);
  
    insert into public.track_day_reports as r (
      enrollment_id, student_id, session_date,
      recited_new, recited_review, heard_recitation, prayed_with_memorised,
      partner_name, recorded_by
    )
    values (
      v_enrollment.id, v_enrollment.student_id, p_session_date,
      coalesce(p_recited_new, false), coalesce(p_recited_review, false),
      coalesce(p_heard, false), coalesce(p_prayed, false),
      v_partner, v_staff
    )
    on conflict (enrollment_id, session_date) do update
       set recited_new           = excluded.recited_new,
           recited_review        = excluded.recited_review,
           heard_recitation      = excluded.heard_recitation,
           prayed_with_memorised = excluded.prayed_with_memorised,
           partner_name          = coalesce(r.partner_name, excluded.partner_name),
           recorded_by           = excluded.recorded_by,
           updated_at            = now();
  
    perform set_config('sohbah.staff_report', '', true);
  end
  $$;
  
  revoke execute on function public.staff_report_track_day(uuid, date, boolean, boolean, boolean, boolean) from public;
  grant  execute on function public.staff_report_track_day(uuid, date, boolean, boolean, boolean, boolean) to authenticated;
  
  create or replace function public.cohort_day_board(
    p_cohort_id uuid,
    p_date      date
  )
  returns table (
    enrollment_id uuid,
    student_name  text,
    partner_name  text,
    reported      boolean,
    recited_new    boolean,
    recited_review boolean,
    heard_recitation      boolean,
    prayed_with_memorised boolean,
    recorded_by_name text,
    can_edit      boolean
  )
  language sql stable security definer set search_path = public
  as $$
    select e.id,
           s.name,
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
           coalesce(r.prayed_with_memorised, false),
           rt.name,
           public.can_manage_cohort(c.id)
             and p_date >= c.start_date
             and p_date <= (now() at time zone c.timezone)::date
      from public.track_enrollments e
      join public.students s on s.id = e.student_id
      join public.track_cohorts c on c.id = e.cohort_id
      left join public.track_day_reports r
             on r.enrollment_id = e.id and r.session_date = p_date
      left join public.teachers rt on rt.id = r.recorded_by
     where e.cohort_id = p_cohort_id
       and public.staff_sees_gender(c.academy_id, c.gender_category)
       and e.status in ('active', 'warned')
       and exists (
         select 1 from public.teachers t
          where t.academy_id = c.academy_id
            and t.auth_user_id = auth.uid()
            and t.is_active
       )
     order by s.name;
  $$;
  
  revoke execute on function public.cohort_day_board(uuid, date) from public;
  grant  execute on function public.cohort_day_board(uuid, date) to authenticated;
  
  commit;
