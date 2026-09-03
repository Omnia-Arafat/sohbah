-- =============================================================================
-- Run this FIRST, before RUN_STEPS_CIRCLE_TYPES.sql. Read-only — nothing here
-- changes any data. It answers the one question that decides whether the next
-- file is safe to run as-is: does every circle's current type match one of the
-- four being seeded?
-- =============================================================================

-- Must return NO ROWS. Anything it returns is a circle whose `type` is neither
-- 'tasheeh', 'tajweed', 'free_recitation' nor 'hadith' — meaning the seed step
-- would not cover it, and the step after it (which requires every circle's
-- type to exist in the new table) would fail and stop, changing nothing.
select id, name, type
  from public.circles
 where type not in ('tasheeh', 'tajweed', 'free_recitation', 'hadith');
