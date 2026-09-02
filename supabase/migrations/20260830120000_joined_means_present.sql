-- Joining a circle is the attendance mark.
--
-- A student reaches `attendance_records` only through join_circle(), which
-- means they opened the circle link and took a place in the queue. Asking the
-- teacher to then tick "present" recorded nothing the row did not already
-- prove, so the teacher-side toggle is gone and the default carries the fact.
--
-- 'pending' and 'absent' stay in the check constraint: historical rows keep
-- their recorded value, and attendance_report() still counts all three. What
-- changes is that new rows land as 'present' instead of waiting for a tick
-- that the UI no longer offers.
--
-- Deliberately NOT backfilled. Existing 'pending' rows are a true record of
-- sessions nobody marked; rewriting them to 'present' would invent attendance
-- that was never confirmed.

alter table public.attendance_records
  alter column attendance_status set default 'present';
