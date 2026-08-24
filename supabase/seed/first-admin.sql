-- =============================================================================
-- Sohbah Academy — Bootstrapping the first admin
--
-- `teachers_admin_insert` requires an existing admin to insert a teacher row,
-- which makes the first one a chicken-and-egg problem. It has to be created once
-- by hand from the Supabase SQL editor, which runs as a superuser and therefore
-- bypasses RLS.
--
-- Run the steps in order. Until step 2 completes, signing in works but
-- /dashboard shows the "not linked to a teacher yet" notice.
-- =============================================================================

-- Step 1 — create the auth user in the Supabase dashboard, not here:
--   Authentication → Users → Add user → "Create new user"
--   Tick "Auto Confirm User" so no email round trip is needed.
--   Copy the resulting user UUID.

-- Step 2 — create the matching teacher row and link it to Sohbah.
-- Replace the UUID and display name before running.
insert into public.teachers (auth_user_id, name, gender_category, role, academy_id)
select
  '00000000-0000-0000-0000-000000000000',  -- paste the auth user UUID from step 1
  'اسم المشرف',                             -- display name shown in the dashboard
  'female',                                -- 'male' | 'female'
  'admin',
  a.id
from public.academies a
where a.slug = 'sohbah';

-- Step 3 — verify the app will see it.
-- `current_teacher_id()` reads auth.uid(), which is null in the SQL editor,
-- so check the join directly instead.
select t.id, t.name, t.role, t.is_active, u.email, a.slug as academy
  from public.teachers  t
  join auth.users       u on u.id = t.auth_user_id
  join public.academies a on a.id = t.academy_id
 where t.role = 'admin';

-- =============================================================================
-- If you bypass the dashboard and insert into auth.users directly
--
-- Only do this when the dashboard is not an option (for example when the
-- project's SMTP cannot deliver a confirmation mail and
-- mailer_autoconfirm is off).
--
-- Two things bite:
--   1. An identity row is required for password sign-in:
--        insert into auth.identities (provider_id, user_id, identity_data,
--                                     provider, last_sign_in_at, created_at, updated_at)
--        values (u.id::text, u.id,
--                jsonb_build_object('sub', u.id::text, 'email', u.email,
--                                   'email_verified', true, 'phone_verified', false),
--                'email', now(), now(), now());
--   2. GoTrue reads several varchar columns into non-nullable strings. A manual
--      insert leaves them NULL and every sign-in then fails with HTTP 500
--      "Database error querying schema". Coerce them to empty strings:
--        update auth.users set
--          confirmation_token         = coalesce(confirmation_token, ''),
--          recovery_token             = coalesce(recovery_token, ''),
--          email_change               = coalesce(email_change, ''),
--          email_change_token_new     = coalesce(email_change_token_new, ''),
--          email_change_token_current = coalesce(email_change_token_current, ''),
--          phone_change               = coalesce(phone_change, ''),
--          phone_change_token         = coalesce(phone_change_token, ''),
--          reauthentication_token     = coalesce(reauthentication_token, '')
--        where email = '<address>';
--
-- Hash the password with pgcrypto, which Supabase installs in `extensions`:
--   extensions.crypt('<password>', extensions.gen_salt('bf'))
-- =============================================================================

-- =============================================================================
-- Adding further teachers
-- Once an admin exists, do this from the app or as that admin — the RLS policy
-- allows it. Create the auth user first (step 1 above), then:
--
--   insert into public.teachers (auth_user_id, name, gender_category, role, academy_id)
--   select '<uuid>', 'اسم المعلمة', 'female', 'teacher', id
--     from public.academies where slug = 'sohbah';
--
-- Deactivate rather than delete, so attendance history stays intact:
--   update public.teachers set is_active = false where id = '<teacher-id>';
-- =============================================================================

-- =============================================================================
-- Optional — a circle to test /circle/[slug] before creating one in the UI.
-- =============================================================================

-- insert into public.circles (teacher_id, name, type, gender_category,
--                             session_link, timezone, start_time, days_of_week,
--                             registration_slug, academy_id)
-- select t.id, 'حلقة التصحيح', 'tasheeh', 'female',
--        'https://meet.google.com/xxx-xxxx-xxx',
--        'Asia/Riyadh', '17:00', '{0,1,2,3,4}', 'tasheeh-evening',
--        a.id
--   from public.teachers  t
--   join public.academies a on a.slug = 'sohbah'
--  where t.role = 'admin'
--  limit 1;
