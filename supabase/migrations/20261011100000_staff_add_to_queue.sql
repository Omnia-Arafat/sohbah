-- A معلمة or مشرفة puts a student into today's قائمة الدور herself.
--
-- Until now the only way in was join_circle(), which the student calls from
-- the circle link. A student who has no phone with her, whose link will not
-- open, or who arrives after registration has closed could not be given a
-- turn at all.
--
-- ADDITIVE ONLY: one new function. No table, policy or existing function
-- changes, so the live site is unaffected until the app calls it.
--
-- Who may call it: the circle's own teacher, or a supervisor/admin of its
-- academy — the same people attendance_update_owner_or_supervisor lets
-- reorder and remove rows.
--
-- What it does NOT check, on purpose:
--   * the registration window — staff decide, so a latecomer can be added
--     while the session is running or after it. Only a day the circle does
--     not meet at all is refused;
--   * max_students — the cap is there to stop a stampede at the link, not to
--     overrule the معلمة.
--
-- The day is circle_registration_window()'s session_date, the same date
-- join_circle() writes and circle_queue() reads (see 20260917140000), so the
-- row appears in the list everyone already sees.
--
-- Rollback:
--   drop function if exists public.staff_add_to_queue(uuid, uuid);

begin;

create or replace function public.staff_add_to_queue(p_circle_id uuid, p_student_id uuid)
returns table (attendance_id uuid, session_date date, queue_order int, already_joined boolean)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_circle  public.circles%rowtype;
  v_student public.students%rowtype;
  v_date    date;
  v_state   text;
  v_row     public.attendance_records%rowtype;
  v_next    int;
begin
  select * into v_circle from public.circles c where c.id = p_circle_id and c.is_active;
  if not found then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;

  if not (v_circle.teacher_id = public.current_teacher_id()
          or public.can_supervise(v_circle.academy_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_student from public.students s where s.id = p_student_id;
  if not found or v_student.academy_id is distinct from v_circle.academy_id then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  if v_student.gender_category is distinct from v_circle.gender_category then
    raise exception 'gender_mismatch' using errcode = '42501';
  end if;

  select w.session_date, w.state into v_date, v_state
    from public.circle_registration_window(
      v_circle.start_time, v_circle.duration_minutes, v_circle.timezone, v_circle.days_of_week
    ) w;

  if v_state = 'not_today' then
    raise exception 'not_today' using errcode = 'P0001';
  end if;

  -- Same lock join_circle() takes, so a student joining from her link at the
  -- same moment cannot collide with this on queue_order.
  perform pg_advisory_xact_lock(hashtext(v_circle.id::text || v_date::text));

  select * into v_row
    from public.attendance_records ar
   where ar.student_id = p_student_id
     and ar.circle_id = v_circle.id
     and ar.session_date = v_date;

  if found then
    return query select v_row.id, v_row.session_date, v_row.queue_order, true;
    return;
  end if;

  select coalesce(max(ar.queue_order), 0) + 1 into v_next
    from public.attendance_records ar
   where ar.circle_id = v_circle.id and ar.session_date = v_date;

  insert into public.attendance_records (student_id, circle_id, session_date, queue_order)
  values (p_student_id, v_circle.id, v_date, v_next)
  returning * into v_row;

  return query select v_row.id, v_row.session_date, v_row.queue_order, false;
end
$$;

revoke execute on function public.staff_add_to_queue(uuid, uuid) from public, anon;
grant  execute on function public.staff_add_to_queue(uuid, uuid) to authenticated;

comment on function public.staff_add_to_queue(uuid, uuid) is
  'The circle''s teacher or a supervisor gives a student a turn in today''s queue, outside the registration window and the cap.';

commit;
