-- Drops the temporary diagnostic from 20260913220000.
--
-- It answered its question — deletions had gone through SQL, 31 of them
-- against `students` all-time — and then the actual account came from the
-- session that made them, with a pre-deletion backup to check it against.
-- Nothing needs to keep reading `pg_stat_user_tables` from inside the app.

drop function if exists public.deletion_counts();
