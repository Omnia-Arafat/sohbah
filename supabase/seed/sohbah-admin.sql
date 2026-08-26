-- =============================================================================
-- Create First Sohbah Admin
-- 
-- This script creates the first admin user for Sohbah Academy.
-- The pattern mirrors `first-admin.sql` but for Sohbah.
-- 
-- BEFORE running this:
-- 1. Create an Auth user in Supabase Dashboard:
--    Authentication → Users → Add user
--    Save the UUID that Supabase generates
-- 
-- 2. Get the Sohbah academy ID:
--    select id from public.academies where slug = 'sohbah';
-- 
-- 3. Replace the placeholders below with actual values
-- 
-- THEN run this script in the Supabase SQL Editor.
-- =============================================================================

-- Get the Sohbah academy ID (copy this value)
select id as sohbah_academy_id 
from public.academies 
where slug = 'sohbah';

-- Replace these placeholders:
-- <AUTH_USER_UUID> = the UUID from the Auth user you just created
-- <SOHBAH_ACADEMY_ID> = the UUID from the query above
-- <ADMIN_NAME> = the admin's name (e.g., 'Sarah Ahmed')
-- <GENDER> = 'male' or 'female'

insert into public.teachers (
  auth_user_id,
  academy_id,
  name,
  gender_category,
  role,
  is_active
)
values (
  '<AUTH_USER_UUID>',
  '<SOHBAH_ACADEMY_ID>',
  '<ADMIN_NAME>',
  '<GENDER>',
  'admin',
  true
)
returning id, name, role;

-- Verify the link worked:
select 
  t.id as teacher_id,
  t.name as teacher_name,
  t.role,
  a.name_en as academy_name,
  au.email as auth_email
from public.teachers t
join public.academies a on a.id = t.academy_id
join auth.users au on au.id = t.auth_user_id
where t.auth_user_id = '<AUTH_USER_UUID>';

-- =============================================================================
-- Example (DO NOT RUN AS-IS, replace the placeholders first):
-- =============================================================================
/*
insert into public.teachers (
  auth_user_id,
  academy_id,
  name,
  gender_category,
  role,
  is_active
)
values (
  '12345678-1234-1234-1234-123456789012',
  '87654321-4321-4321-4321-210987654321',
  'Sarah Ahmed',
  'female',
  'admin',
  true
)
returning id, name, role;
*/

-- =============================================================================
-- Notes:
-- 
-- * The academy_id ties this teacher to Sohbah only
-- * They will only see Sohbah circles, students, and teachers
-- * They can create new Sohbah circles only
-- =============================================================================
