-- Take `anon` off the recitation log at the grant level, not just at RLS.
--
-- The table has no anon policy, so an unauthenticated read already returns
-- nothing. But Supabase's default privileges grant every new table in `public`
-- to `anon` and `authenticated` by name, and `revoke ... from public` does NOT
-- remove a grant made to a role by name — that was learnt the hard way on the
-- quiz tables (20260912150000).
--
-- Leaving the grant in place means the only thing standing between a stranger
-- and "فاطمة، سورة الكهف، ٣ أخطاء جلية" is one policy being correct forever.
-- Two independent barriers is the right number for a record like this.

revoke all on table public.recitation_logs from anon;
