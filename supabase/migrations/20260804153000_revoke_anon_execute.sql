-- =============================================================================
-- Close a privilege gap left by 20260804150000_init.sql.
--
-- That migration ends with "deny by default, then allow explicitly":
--
--   revoke execute on function public.teacher_today_circles() from public;
--   grant  execute on function public.teacher_today_circles() to authenticated;
--
-- On Supabase that is not sufficient. Supabase ships
-- `alter default privileges ... grant execute on functions to anon, authenticated,
-- service_role` for the public schema, so `anon` receives EXECUTE *directly* at
-- creation time. Revoking from PUBLIC does not remove a direct grant, so anon
-- kept EXECUTE on all three privileged functions.
--
-- Verified against the deployed project: an anonymous PostgREST caller got
-- HTTP 200 from /rest/v1/rpc/teacher_today_circles.
--
-- No data was exposed, because each function is written defensively:
--   * teacher_today_circles() filters on current_teacher_id()/is_admin(), both of
--     which resolve to null/false without a session, so the result was empty.
--   * attendance_report() has `where public.is_admin()`.
--   * reorder_queue() raises 'forbidden' (42501) unless owner or admin.
-- This restores the intended boundary so those checks are defence in depth
-- rather than the only thing standing between anon and these functions.
-- =============================================================================

revoke execute on function public.teacher_today_circles()                   from anon;
revoke execute on function public.reorder_queue(uuid, date, uuid[])         from anon;
revoke execute on function public.attendance_report(date, date, text, uuid, uuid) from anon;

-- Belt and braces: keep the intended grants in place explicitly.
grant execute on function public.teacher_today_circles()                    to authenticated;
grant execute on function public.reorder_queue(uuid, date, uuid[])          to authenticated;
grant execute on function public.attendance_report(date, date, text, uuid, uuid) to authenticated;

-- =============================================================================
-- Deliberately NOT revoked from anon: public.normalize_ar(text).
--
-- `students.search_key` is a generated column whose expression calls it, and a
-- generated column is evaluated with the privileges of the role performing the
-- INSERT. Since `students_public_insert` lets anon register, removing anon's
-- EXECUTE here would break public registration outright.
-- =============================================================================
