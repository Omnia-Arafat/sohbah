-- Schedule boards — the public weekly timetable.
--
-- A board holds only presentation: a title, an optional note, which circle
-- type it covers, and where it sits in the running order. The rows and cells
-- of the table it renders are never stored here — they are read live from
-- `circles` every time the page loads, so a circle that moves day, changes
-- teacher, or is deactivated changes the published timetable at the same
-- moment, with nobody re-typing anything.
--
-- `(academy_id, circle_type)` is deliberately NOT unique: an academy may want
-- two boards over the same type (a boys' one and a girls' one, say), which is
-- what `gender_category` narrows.

create table public.schedule_boards (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null references public.academies(id) on delete cascade,
  circle_type      text not null,
  -- Null means the board covers both sections.
  gender_category  text check (gender_category in ('male', 'female')),
  title_ar         text not null check (btrim(title_ar) <> ''),
  title_en         text not null check (btrim(title_en) <> ''),
  note_ar          text,
  note_en          text,
  display_order    int not null default 0,
  is_published     boolean not null default true,
  created_at       timestamptz not null default now(),
  constraint fk_schedule_boards_type
    foreign key (academy_id, circle_type)
    references public.circle_types (academy_id, slug)
);

create index idx_schedule_boards_academy
  on public.schedule_boards (academy_id, display_order)
  where is_published;

alter table public.schedule_boards enable row level security;

-- Published boards are readable by anyone, signed in or not: the timetable is
-- the academy's public notice board. An admin additionally sees their own
-- academy's unpublished drafts.
create policy schedule_boards_select on public.schedule_boards
  for select to anon, authenticated
  using (is_published or public.is_admin_of(academy_id));

create policy schedule_boards_admin_insert on public.schedule_boards
  for insert to authenticated
  with check (public.is_admin_of(academy_id));

create policy schedule_boards_admin_update on public.schedule_boards
  for update to authenticated
  using (public.is_admin_of(academy_id))
  with check (public.is_admin_of(academy_id));

create policy schedule_boards_admin_delete on public.schedule_boards
  for delete to authenticated
  using (public.is_admin_of(academy_id));
