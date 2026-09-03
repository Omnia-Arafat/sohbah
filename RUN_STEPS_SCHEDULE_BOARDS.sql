create table public.schedule_boards (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null references public.academies(id) on delete cascade,
  circle_type      text not null,
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
