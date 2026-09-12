-- `revoke execute ... from public` is not enough to hide a function from the
-- Data API.
--
-- Supabase grants EXECUTE on new functions in `public` to the API roles
-- (`anon`, `authenticated`, `service_role`) directly, via default privileges —
-- see the `[api]` notes in supabase/config.toml. Revoking from the PUBLIC
-- pseudo-role does not touch a grant made to `anon` by name, so
-- `quiz_covers_circle` was still callable by an anonymous visitor.
--
-- What leaked was small: a boolean saying whether a quiz applies to a circle,
-- and only to a caller who already holds both uuids. No answer key, no roster.
-- But this function exists to be called by the other SECURITY DEFINER
-- functions, not by a browser, so the grant is removed explicitly.
--
-- The tables are unaffected: RLS on `quiz_options` and friends has no anon
-- policy at all, which is what actually keeps the answer key out of reach.

revoke execute on function public.quiz_covers_circle(uuid, uuid) from anon;
