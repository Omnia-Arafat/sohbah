-- Lets the sign-in screen say WHICH half is wrong.
--
-- `teacherSignIn` returned one message for "no account with this number" and
-- "wrong password" alike, so that nobody could test phone numbers against the
-- staff list. The cost of that turned out to be higher than the risk it avoids.
--
-- The number IS the account: `normalize_phone()` keeps digits only, so
-- "0561094834", "+966561094834" and "00966561094834" are three different
-- accounts for one person. Six different shapes are stored across this
-- academy's thirty staff rows. Someone who registered one way and signs in
-- another gets told her PASSWORD is wrong, tries it again, asks for a reset,
-- and is still locked out — because the password was never the problem. The
-- one message hid the only fact that would have helped her.
--
-- WHAT THIS GIVES UP, stated plainly: anyone can now learn whether a given
-- number belongs to a member of staff, one number at a time. That is the
-- enumeration the single message was protecting, and this is a deliberate
-- trade — requested after the cost was explained. It is kept as small as it
-- can be: a boolean, for one academy, and nothing about who she is, whether
-- she is approved, or whether she has a login at all.
--
-- Takes the already-normalized key rather than a raw number, so the caller
-- cannot make this function disagree with `credentialEmail()` about what the
-- key is.

create or replace function public.staff_phone_registered(
  p_phone_key    text,
  p_academy_slug text
)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.teachers t
      join public.academies a on a.id = t.academy_id
     where a.slug     = p_academy_slug
       and t.phone_key = p_phone_key
  )
$$;

comment on function public.staff_phone_registered(text, text) is
  'Whether any staff row in that academy carries this phone key. Boolean only — used by the sign-in screen to separate "wrong number" from "wrong password".';

revoke execute on function public.staff_phone_registered(text, text) from public;
grant  execute on function public.staff_phone_registered(text, text) to anon, authenticated;
