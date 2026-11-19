begin;

drop policy if exists weeks_supervisor_insert on public.track_weeks;
create policy weeks_supervisor_insert on public.track_weeks
  for insert to authenticated
  with check (exists (select 1 from public.tracks t
                       where t.id = track_weeks.track_id
                         and public.can_supervise(t.academy_id)));

drop policy if exists weeks_supervisor_update on public.track_weeks;
create policy weeks_supervisor_update on public.track_weeks
  for update to authenticated
  using (exists (select 1 from public.tracks t
                  where t.id = track_weeks.track_id
                    and public.can_supervise(t.academy_id)))
  with check (exists (select 1 from public.tracks t
                       where t.id = track_weeks.track_id
                         and public.can_supervise(t.academy_id)));

drop policy if exists week_days_supervisor_insert on public.track_week_days;
create policy week_days_supervisor_insert on public.track_week_days
  for insert to authenticated
  with check (exists (select 1 from public.track_weeks w
                        join public.tracks t on t.id = w.track_id
                       where w.id = track_week_days.week_id
                         and public.can_supervise(t.academy_id)));

drop policy if exists week_days_supervisor_update on public.track_week_days;
create policy week_days_supervisor_update on public.track_week_days
  for update to authenticated
  using (exists (select 1 from public.track_weeks w
                   join public.tracks t on t.id = w.track_id
                  where w.id = track_week_days.week_id
                    and public.can_supervise(t.academy_id)))
  with check (exists (select 1 from public.track_weeks w
                        join public.tracks t on t.id = w.track_id
                       where w.id = track_week_days.week_id
                         and public.can_supervise(t.academy_id)));

commit;
