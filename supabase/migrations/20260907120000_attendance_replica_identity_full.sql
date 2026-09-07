-- The live queue (circle-client.tsx, session-client.tsx) now subscribes to
-- Realtime changes on attendance_records, filtered to `circle_id=eq.<id>`.
--
-- With the default replica identity (primary key only), a DELETE's payload
-- carries just the deleted row's `id` — not `circle_id` — so the filter has
-- nothing to match against and the event is silently dropped. A student
-- removed from the queue would then only disappear for everyone once they
-- happened to reload. Full replica identity puts every column of the old
-- row on the DELETE (and UPDATE) payload, so the filter works the same way
-- for every event type.

alter table public.attendance_records replica identity full;
