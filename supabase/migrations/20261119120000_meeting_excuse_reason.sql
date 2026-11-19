-- عذر اللقاء: why a student was excused from the weekly meeting.
--
-- track_meeting_scores already has `excused`, and the report already leaves an
-- excused بند out of the week's possible total. What was missing is the reason,
-- so the معلمة can write it once and it shows in the reports.
--
-- Additive only: one new nullable column, nothing existing is changed.
alter table public.track_meeting_scores
  add column if not exists excuse_reason text;
