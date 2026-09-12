-- Take `anon` off the quiz tables at the grant level, not just at RLS.
--
-- Found during a pre-deploy check of production: an anonymous request to
-- `/rest/v1/quiz_options?select=is_correct` comes back 200. It returns zero
-- rows — RLS is doing its job, the answer key is not leaking — but 200 rather
-- than 401 means the GRANT to `anon` is still there, and RLS is the only thing
-- standing between a stranger and `is_correct`.
--
-- 20260912140000 said it plainly: there is no anon policy on any of these
-- tables, precisely because `quiz_options.is_correct` is the answer key. What
-- it did not do is revoke the default privilege Supabase hands every new table
-- in `public` to `anon` and `authenticated` BY NAME. 20260912150000 revoked the
-- helper FUNCTION from anon and stopped there; the tables kept their grant.
--
-- This is the same gap that was closed on `recitation_logs` in
-- 20260913092000, and the same lesson as the one that migration records:
-- `revoke ... from public` does not remove a grant made to a role by name.
--
-- Nothing legitimate breaks. Every direct read of these tables in the app is
-- an authenticated /admin route; a student reaches a quiz only through
-- `quiz_for_student()` and the other SECURITY DEFINER functions, which omit
-- `is_correct` by construction rather than by remembering to exclude it.
--
-- `authenticated` keeps its grant — that is what the admin screens use, and
-- the policies on these tables are what scope it to her own academy.

revoke all on table public.quizzes        from anon;
revoke all on table public.quiz_questions from anon;
revoke all on table public.quiz_options   from anon;
revoke all on table public.quiz_attempts  from anon;
revoke all on table public.quiz_answers   from anon;
