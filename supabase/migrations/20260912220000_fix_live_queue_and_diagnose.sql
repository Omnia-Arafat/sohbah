-- URGENT, with a class in session.
--
-- 1. REPLICA IDENTITY — the actual bug, and my mistake.
--
-- Earlier in this project the migration history was repaired: 21 migrations
-- were marked "applied" after probing a sample of the objects they create.
-- 20260907120000 was one of the ones NOT probed, and introspection has now
-- shown that `attendance_records` is still on `replica identity default`.
-- Marking it applied means `db push` will never run it, so the statement is
-- repeated here where it will actually execute.
--
-- The consequence is exactly what was reported. The live queue subscribes to
-- `attendance_records` filtered on `circle_id=eq.<id>`. With the default
-- replica identity the old row in an UPDATE/DELETE payload carries only the
-- primary key, so `circle_id` is absent, the filter matches nothing, and the
-- event is dropped. Every student sees a queue frozen at whatever it was when
-- their page loaded — "الدور مش ظاهر كله لكل الناس".
--
-- Idempotent: setting it again on a table that already has it is a no-op.

alter table public.attendance_records replica identity full;

-- =============================================================================
-- 2. A diagnostic for the second report — the مشرفة unable to change a
--    student's status.
--
-- The policy for that (`attendance_update_owner_or_supervisor`) IS present,
-- the roles ARE assigned, and every supervisor and circle sits in the same
-- academy. So reasoning says it should work, which means reasoning is missing
-- something and the honest move is to run the real UPDATE under her identity
-- rather than guess again.
--
-- This impersonates one staff member inside a transaction, attempts the same
-- write the app makes, reports how many rows it touched, and always rolls
-- back — nothing it does can change a student's record. Dropped again in the
-- migration that follows once it has answered the question.
-- =============================================================================

create or replace function public.debug_try_update(p_auth_user uuid, p_attendance_id uuid)
returns table (step text, result text)
language plpgsql security definer set search_path = public
as $$
declare
  v_rows int;
begin
  -- Become that signed-in user for the rest of this transaction: the same
  -- role and the same `auth.uid()` PostgREST would set up for her request.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_auth_user, 'role', 'authenticated')::text,
                     true);

  return query select 'auth.uid()'::text, coalesce(auth.uid()::text, '(null)');
  return query select 'current_teacher_id()'::text, coalesce(public.current_teacher_id()::text, '(null)');
  return query select 'is_staff()'::text, coalesce(public.is_staff()::text, '(null)');

  return query
    select 'can_supervise(circle academy)'::text,
           coalesce(public.can_supervise(c.academy_id)::text, '(null)')
      from public.attendance_records ar
      join public.circles c on c.id = ar.circle_id
     where ar.id = p_attendance_id;

  -- Can she even see the circle row the policy's subquery reads? If RLS on
  -- `circles` hides it, the attendance policy's EXISTS is false and the
  -- UPDATE quietly touches zero rows — PostgREST reports no error for that.
  return query
    select 'circles visible to her'::text, count(*)::text
      from public.circles c
      join public.attendance_records ar on ar.circle_id = c.id
     where ar.id = p_attendance_id;

  return query
    select 'attendance row visible'::text, count(*)::text
      from public.attendance_records ar
     where ar.id = p_attendance_id;

  -- The real write, under her identity and the real policy.
  update public.attendance_records
     set recitation_status = recitation_status
   where id = p_attendance_id;
  get diagnostics v_rows = row_count;

  return query select 'UPDATE rows affected'::text, v_rows::text;

  -- Never keep it.
  raise exception using errcode = 'P0001', message = 'debug_rollback';
exception
  when others then
    if sqlerrm = 'debug_rollback' then
      return;
    end if;
    return query select 'ERROR'::text, sqlerrm;
end
$$;

revoke execute on function public.debug_try_update(uuid, uuid) from public;
revoke execute on function public.debug_try_update(uuid, uuid) from anon;
revoke execute on function public.debug_try_update(uuid, uuid) from authenticated;
