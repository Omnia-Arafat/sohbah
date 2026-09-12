-- Removes the two diagnostic functions added while chasing the live-queue
-- failure. They have answered their question and have no business living on a
-- production database: one reads pg_policies, the other impersonates a staff
-- member to test a policy. Neither was ever granted to anon or authenticated,
-- but the right place for them is gone rather than merely locked.
--
-- What they established, for the record:
--
--   * `attendance_records` was still on `replica identity default`, so every
--     Realtime UPDATE/DELETE filtered on `circle_id` was dropped. Fixed in
--     20260912220000.
--   * The supervisor policies were present and correct all along — a مشرفة's
--     UPDATE was verified end to end through the app and it lands. The reason
--     it looked broken is the same dead Realtime: her change saved, and nobody
--     else's screen ever showed it.

drop function if exists public.debug_policy_state();
drop function if exists public.debug_try_update(uuid, uuid);
