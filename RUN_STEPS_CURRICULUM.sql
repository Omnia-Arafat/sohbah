-- The content layer: a curriculum, its units, the materials attached to them,
-- and which unit a circle is teaching on a given day.
--
-- None of this is Hadith-specific by design. A حلقة الحديث needs somewhere to
-- put "الحديث الأول: إنما الأعمال بالنيات" — its text, its narrator, where it
-- is reported from, its grade — and somewhere to put the slides the معلمة
-- shows while explaining it. A حلقة تجويد needs exactly the same shape with
-- different words in it: a unit is a باب من المتن instead of a حديث, and the
-- narrator/source/grade columns simply stay null.
--
-- So the tables hang off `circle_types` (already an academy-managed list since
-- 20260830190000, with `hadith` seeded there) rather than off a hard-coded
-- notion of "hadith". Adding منهج التجويد later is data entry, not a migration.
--
-- Who may write here: any approved member of staff of the academy —
-- `is_staff_of()`. A معلمة preparing her own lesson must be able to add the
-- حديث she is teaching and upload her own slides without waiting for a مشرفة.
-- Deleting is the exception: it is the one irreversible action, so it stays
-- with a مشرفة or an admin (`can_supervise()`).

-- =============================================================================
-- 1. Curricula — "الأربعون النووية" under hadith, "تحفة الأطفال" under tajweed
-- =============================================================================

create table public.curricula (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete cascade,
  circle_type   text not null,
  name_ar       text not null check (btrim(name_ar) <> ''),
  name_en       text not null check (btrim(name_en) <> ''),
  description   text,
  display_order int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  -- Composite FK, same as `schedule_boards`: it is what stops a curriculum
  -- from pointing at another academy's type.
  constraint fk_curricula_type
    foreign key (academy_id, circle_type)
    references public.circle_types (academy_id, slug)
);

create index idx_curricula_academy
  on public.curricula (academy_id, circle_type, display_order)
  where is_active;

-- =============================================================================
-- 2. Units — one حديث, or one باب من المتن
-- =============================================================================

create table public.curriculum_units (
  id            uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curricula(id) on delete cascade,
  position      int  not null check (position > 0),
  title_ar      text not null check (btrim(title_ar) <> ''),
  title_en      text not null check (btrim(title_en) <> ''),
  -- The text itself: the حديث in full, or the أبيات of the متن.
  body          text,
  explanation   text,
  -- Hadith-specific, all optional — a tajweed unit leaves every one of them
  -- null, which is the whole reason this table is not four tables.
  narrator      text,   -- عن عمر بن الخطاب رضي الله عنه
  source_book   text,   -- رواه البخاري ومسلم
  source_ref    text,   -- البخاري ١، مسلم ١٩٠٧
  grade         text,   -- صحيح
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  -- Deferrable so a reorder can permute positions inside one transaction —
  -- the same reason `uq_attendance_queue_position` is deferrable.
  constraint uq_unit_position
    unique (curriculum_id, position) deferrable initially deferred
);

create index idx_units_curriculum on public.curriculum_units (curriculum_id, position);

-- =============================================================================
-- 3. Materials — slides, images, recordings, links
--
-- Attached to a unit (every circle teaching that حديث sees them) or to a single
-- circle (this معلمة's own handout). Exactly one owner, and exactly one source:
-- either an external link or a file in the `materials` storage bucket.
-- =============================================================================

create table public.materials (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id) on delete cascade,
  unit_id      uuid references public.curriculum_units(id) on delete cascade,
  circle_id    uuid references public.circles(id) on delete cascade,
  kind         text not null check (kind in ('image','pdf','slides','audio','video','link')),
  title        text not null check (btrim(title) <> ''),
  -- An external link (Drive, Canva, YouTube) …
  url          text,
  -- … or an object key inside the `materials` bucket. Never both.
  storage_path text,
  position     int  not null default 0,
  uploaded_by  uuid references public.teachers(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint ck_materials_source check (num_nonnulls(url, storage_path) = 1),
  constraint ck_materials_owner  check (num_nonnulls(unit_id, circle_id) = 1)
);

create index idx_materials_unit   on public.materials (unit_id, position)   where unit_id is not null;
create index idx_materials_circle on public.materials (circle_id, position) where circle_id is not null;

-- =============================================================================
-- 4. The day's lesson
--
-- One small row per (circle, day). `attendance_records` is deliberately not
-- touched: the queue mechanic is unchanged, this only records *what* the
-- circle is on today.
-- =============================================================================

create table public.circle_sessions (
  circle_id    uuid not null references public.circles(id) on delete cascade,
  session_date date not null,
  unit_id      uuid references public.curriculum_units(id) on delete set null,
  note         text,
  updated_by   uuid references public.teachers(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (circle_id, session_date)
);

-- =============================================================================
-- 5. RLS
-- =============================================================================

alter table public.curricula        enable row level security;
alter table public.curriculum_units enable row level security;
alter table public.materials        enable row level security;
alter table public.circle_sessions  enable row level security;

-- --- curricula --------------------------------------------------------------
-- Staff read directly. Students never touch this table — they see the day's
-- lesson through `circle_lesson()` below, which is SECURITY DEFINER.
create policy curricula_select_staff on public.curricula
  for select to authenticated
  using (public.is_staff_of(academy_id));

create policy curricula_insert_staff on public.curricula
  for insert to authenticated
  with check (public.is_staff_of(academy_id));

create policy curricula_update_staff on public.curricula
  for update to authenticated
  using (public.is_staff_of(academy_id))
  with check (public.is_staff_of(academy_id));

-- Deleting a curriculum takes every unit with it (ON DELETE CASCADE), and with
-- them the lessons that referenced those units. Irreversible, so: مشرفة only.
create policy curricula_delete_supervisor on public.curricula
  for delete to authenticated
  using (public.can_supervise(academy_id));

-- --- curriculum_units -------------------------------------------------------
-- Every policy reaches through to the parent's academy_id: a unit has no
-- academy of its own, and duplicating the column would let the two disagree.
create policy units_select_staff on public.curriculum_units
  for select to authenticated
  using (exists (select 1 from public.curricula c
                  where c.id = curriculum_units.curriculum_id
                    and public.is_staff_of(c.academy_id)));

create policy units_insert_staff on public.curriculum_units
  for insert to authenticated
  with check (exists (select 1 from public.curricula c
                       where c.id = curriculum_units.curriculum_id
                         and public.is_staff_of(c.academy_id)));

create policy units_update_staff on public.curriculum_units
  for update to authenticated
  using (exists (select 1 from public.curricula c
                  where c.id = curriculum_units.curriculum_id
                    and public.is_staff_of(c.academy_id)))
  with check (exists (select 1 from public.curricula c
                       where c.id = curriculum_units.curriculum_id
                         and public.is_staff_of(c.academy_id)));

create policy units_delete_supervisor on public.curriculum_units
  for delete to authenticated
  using (exists (select 1 from public.curricula c
                  where c.id = curriculum_units.curriculum_id
                    and public.can_supervise(c.academy_id)));

-- --- materials --------------------------------------------------------------
create policy materials_select_staff on public.materials
  for select to authenticated
  using (public.is_staff_of(academy_id));

create policy materials_insert_staff on public.materials
  for insert to authenticated
  with check (public.is_staff_of(academy_id));

create policy materials_update_staff on public.materials
  for update to authenticated
  using (public.is_staff_of(academy_id))
  with check (public.is_staff_of(academy_id));

-- Unlike a curriculum, a material is a single attachment: the معلمة who put
-- the wrong image up should be able to take it down herself. Her own circle's
-- material, or — for a shared unit material — a مشرفة.
create policy materials_delete_owner on public.materials
  for delete to authenticated
  using (
    public.can_supervise(academy_id)
    or uploaded_by = public.current_teacher_id()
    or exists (select 1 from public.circles c
                where c.id = materials.circle_id
                  and c.teacher_id = public.current_teacher_id())
  );

-- --- circle_sessions --------------------------------------------------------
-- The circle's own معلمة sets today's lesson; a مشرفة may set it for any
-- circle in her academy. Same rule as `circles_update_own_or_supervisor`.
create policy sessions_select_staff on public.circle_sessions
  for select to authenticated
  using (exists (select 1 from public.circles c
                  where c.id = circle_sessions.circle_id
                    and public.is_staff_of(c.academy_id)));

create policy sessions_write_owner on public.circle_sessions
  for all to authenticated
  using (exists (select 1 from public.circles c
                  where c.id = circle_sessions.circle_id
                    and (c.teacher_id = public.current_teacher_id()
                         or public.can_supervise(c.academy_id))))
  with check (exists (select 1 from public.circles c
                       where c.id = circle_sessions.circle_id
                         and (c.teacher_id = public.current_teacher_id()
                              or public.can_supervise(c.academy_id))));

-- =============================================================================
-- 6. The student's view
--
-- A student is anonymous and holds one credential: the circle's
-- registration_slug. So the lesson reaches them the same way the queue does —
-- through a SECURITY DEFINER function that returns only what a printed handout
-- would show anyway, and never the session link, a phone number, or the
-- academy's whole curriculum.
-- =============================================================================

create or replace function public.circle_lesson(p_slug text)
returns table (
  unit_id       uuid,
  -- Not `position`: that is a reserved word in a RETURNS TABLE column list
  -- (SQL's POSITION function), and Postgres rejects the definition outright.
  unit_position int,
  title_ar      text,
  title_en      text,
  body          text,
  explanation   text,
  narrator      text,
  source_book   text,
  source_ref    text,
  grade         text,
  note          text,
  curriculum_ar text,
  curriculum_en text
)
language sql stable security definer set search_path = public
as $$
  select u.id, u.position, u.title_ar, u.title_en, u.body, u.explanation,
         u.narrator, u.source_book, u.source_ref, u.grade,
         cs.note, cur.name_ar, cur.name_en
    from public.circles c
    join public.circle_sessions cs
      on cs.circle_id = c.id
     and cs.session_date = (now() at time zone c.timezone)::date
    left join public.curriculum_units u on u.id = cs.unit_id
    left join public.curricula cur on cur.id = u.curriculum_id
   where c.registration_slug = p_slug and c.is_active;
$$;

-- Materials for today: the ones attached to today's unit, plus the ones the
-- معلمة attached to this circle itself. `storage_path` comes back raw — the
-- server signs it before it reaches a browser, so a bucket object is never on
-- a permanent public URL.
create or replace function public.circle_materials(p_slug text)
returns table (
  id           uuid,
  kind         text,
  title        text,
  url          text,
  storage_path text,
  scope        text
)
language sql stable security definer set search_path = public
as $$
  with circle as (
    select c.id, c.timezone
      from public.circles c
     where c.registration_slug = p_slug and c.is_active
  ),
  today as (
    select cs.unit_id
      from circle c
      join public.circle_sessions cs
        on cs.circle_id = c.id
       and cs.session_date = (now() at time zone c.timezone)::date
  )
  select m.id, m.kind, m.title, m.url, m.storage_path,
         case when m.unit_id is not null then 'unit' else 'circle' end
    from public.materials m
   where m.unit_id in (select unit_id from today)
      or m.circle_id in (select id from circle)
   order by m.position, m.created_at;
$$;

revoke execute on function public.circle_lesson(text)    from public;
revoke execute on function public.circle_materials(text) from public;
grant  execute on function public.circle_lesson(text)    to anon, authenticated;
grant  execute on function public.circle_materials(text) to anon, authenticated;

-- =============================================================================
-- 7. Storage bucket for uploaded materials
--
-- Private. Uploading and reading both go through the server with the service
-- role (`src/lib/supabase/admin.ts`), which checks the caller's role first and
-- hands the browser a short-lived signed URL — so no storage RLS policy is
-- needed, and no object sits on a permanent public link. An academy for
-- children should not have its lesson images indexable.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'materials', 'materials', false,
  5242880,                                             -- 5 MB per file
  array['image/jpeg', 'image/png', 'image/webp']       -- phase 1: images only
)
on conflict (id) do nothing;
