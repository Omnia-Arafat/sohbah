-- TEMPORARY. Read-only diagnostics, dropped by the next migration.
--
-- Seven students disappeared from the sohbah academy during today's work and
-- nothing in the application can say who: every table that references
-- `students` cascades, so a deleted student takes her attendance, her
-- attempts and her progress with her and leaves no trace to read.
--
-- Postgres itself keeps a count. `pg_stat_user_tables` tallies inserts,
-- updates and deletes per table since the last stats reset, which at least
-- answers whether rows were deleted through SQL at all and how many — and
-- whether the cascade fired on the tables that hang off `students`.
--
-- This does not name anybody. Nothing can, short of point-in-time recovery.
-- It exists to tell the user which of those two conversations to have.

create or replace function public.deletion_counts()
returns table (
  relname     text,
  inserted    bigint,
  updated     bigint,
  deleted     bigint,
  live_rows   bigint,
  last_vacuum timestamptz
)
language sql stable security definer set search_path = public, pg_catalog
as $$
  select s.relname::text, s.n_tup_ins, s.n_tup_upd, s.n_tup_del,
         s.n_live_tup, greatest(s.last_autovacuum, s.last_vacuum)
    from pg_stat_user_tables s
   where s.schemaname = 'public'
     and s.relname in ('students', 'attendance_records', 'quiz_attempts',
                       'student_unit_progress', 'recitation_logs', 'circles')
   order by s.relname;
$$;

revoke execute on function public.deletion_counts() from public, anon;
grant  execute on function public.deletion_counts() to authenticated;
