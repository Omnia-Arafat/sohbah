-- A board can now narrow to a time window as well as a circle type.
--
-- The academy's own printed timetable splits one circle type across separate
-- columns by the hour it runs at — "تصحيح تلاوة 2ظ" and "تصحيح تلاوة 5م" are
-- both `tasheeh`, and putting all 21 of them in one table is not the schedule
-- anybody recognises. Both columns are nullable and both are open-ended on
-- their own, so a board that wants every hour of its type just leaves them
-- empty and behaves exactly as it did before this migration.

alter table public.schedule_boards
  add column start_from time,
  add column start_to   time;

alter table public.schedule_boards
  add constraint chk_schedule_boards_time_window
    check (start_from is null or start_to is null or start_from <= start_to);
