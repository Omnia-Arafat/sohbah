alter table public.track_meeting_scores
  add column if not exists excuse_reason text;
