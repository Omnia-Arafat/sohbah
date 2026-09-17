-- The rest of the screens that were each deciding "today" for themselves.
--
-- 20260917140000 fixed the one that made a student vanish from the queue. The
-- same split runs through three more functions, with the same shape: something
-- is WRITTEN against the session the circle is actually in, and READ back
-- against whatever date the reader happened to compute.
--
--   circle_lesson / circle_materials
--       `lesson-actions.ts` saves درس اليوم under `circle_public_info`'s
--       session_date — the window's. Both readers then look for
--       `(now() at time zone tz)::date`. For a circle that runs past midnight
--       the معلمة picks a lesson at 22:10 and it disappears from the students'
--       page at 00:00, along with the day's attachments, while the session is
--       still running.
--
--   teacher_today_circles
--       Lists a circle when today's weekday is one of its days. At 00:30 the
--       22:00 circle she is in the middle of running is no longer "today", so
--       it drops off her dashboard mid-session — and its `joined_count` was
--       counting a date the queue no longer agrees with anyway.
--
-- All three now ask `circle_registration_window()`, which returns today for
-- every circle that does not span midnight. So for the twenty-odd circles that
-- start in the morning or afternoon this migration changes nothing at all.
--
-- NOT changed, deliberately: `academy_live_circles`. It answers a different
-- question — what is running RIGHT NOW for the front door — and its own
-- comment records why it refuses a grace period: "a circle that finished is
-- not happening now, and leaving it on the front door for another twenty
-- minutes is how a student joins an empty room." The registration window
-- deliberately HAS an hour of grace. Folding one into the other would put
-- finished circles back on the home screen, which is the opposite of what that
-- function was written to prevent. It needs its own midnight handling, as its
-- own change, with its own test.

-- --- The day's lesson --------------------------------------------------------

create or replace function public.circle_lesson(p_slug text)
-- `unit_position`, not `position`: the latter is reserved in Postgres, and
-- this is the name the function already returns.
returns table (
  unit_id uuid, unit_position integer, title_ar text, title_en text, body text,
  explanation text, narrator text, source_book text, source_ref text,
  grade text, note text, curriculum_ar text, curriculum_en text
)
language sql stable security definer set search_path = public
as $$
  select u.id, u.position, u.title_ar, u.title_en, u.body, u.explanation,
         u.narrator, u.source_book, u.source_ref, u.grade,
         cs.note, cur.name_ar, cur.name_en
    from public.circles c
    cross join lateral public.circle_registration_window(
      c.start_time, c.duration_minutes, c.timezone, c.days_of_week
    ) w
    join public.circle_sessions cs
      on cs.circle_id = c.id
     and cs.session_date = w.session_date
    left join public.curriculum_units u on u.id = cs.unit_id
    left join public.curricula cur on cur.id = u.curriculum_id
   where c.registration_slug = p_slug and c.is_active;
$$;

comment on function public.circle_lesson(text) is
  'The lesson for the session the circle is currently in — the same one the معلمة saved it against.';

-- --- The day's attachments --------------------------------------------------

create or replace function public.circle_materials(p_slug text)
returns table (
  id uuid, kind text, title text, url text, storage_path text, scope text
)
language sql stable security definer set search_path = public
as $$
  with circle as (
    select c.id, c.timezone, w.session_date
      from public.circles c
      cross join lateral public.circle_registration_window(
        c.start_time, c.duration_minutes, c.timezone, c.days_of_week
      ) w
     where c.registration_slug = p_slug and c.is_active
  ),
  today as (
    select cs.unit_id
      from circle c
      join public.circle_sessions cs
        on cs.circle_id = c.id
       and cs.session_date = c.session_date
  )
  select m.id, m.kind, m.title, m.url, m.storage_path,
         case when m.unit_id is not null then 'unit' else 'circle' end
    from public.materials m
   where m.unit_id in (select unit_id from today)
      or m.circle_id in (select id from circle)
   order by m.position, m.created_at;
$$;

-- --- The معلمة's own list of today's circles --------------------------------
-- The weekday test moves onto the window's session date as well, so a circle
-- she is still running at half past midnight stays on her dashboard instead of
-- disappearing out from under her.

create or replace function public.teacher_today_circles()
returns table (
  id                uuid,
  name              text,
  type              text,
  gender_category   text,
  start_time        time,
  timezone          text,
  registration_slug text,
  session_date      date,
  joined_count      bigint,
  academy_id        uuid
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.type, c.gender_category,
         c.start_time, c.timezone, c.registration_slug,
         w.session_date,
         count(ar.id),
         c.academy_id
    from public.circles c
    cross join lateral public.circle_registration_window(
      c.start_time, c.duration_minutes, c.timezone, c.days_of_week
    ) w
    left join public.attendance_records ar
      on ar.circle_id    = c.id
     and ar.session_date = w.session_date
   where c.is_active
     and (c.teacher_id = public.current_teacher_id()
          or public.can_supervise(c.academy_id))
     and extract(dow from w.session_date)::smallint = any(c.days_of_week)
   group by c.id, w.session_date
   order by c.start_time;
$$;

comment on function public.teacher_today_circles() is
  'Today''s circles: a معلمة''s own, or every circle in the academy for a مشرفة or admin. Dated by `circle_registration_window()`, so a session running past midnight stays listed.';
