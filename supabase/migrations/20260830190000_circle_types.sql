-- Circle types become an academy-managed list instead of a hard-coded set.
--
-- Until now `circles.type` was `text check (type in ('tasheeh', 'tajweed',
-- 'free_recitation'))`, with the label for each looked up from a fixed i18n
-- key (`circle.type.<value>`). Adding a type — like "حلقة الحديث" — meant a
-- code change and a redeploy. This moves the list into the database, where a
-- مشرفة can add one from /admin/circle-types with no code involved, and adds
-- "حلقة الحديث" (Hadith Circle) as the first type created that way.
--
-- A new type has no i18n key by construction, so it carries its own bilingual
-- name (`name_ar`/`name_en`) rather than being looked up by key — the same
-- shape `academies` already uses for its own bilingual fields.

create table public.circle_types (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  -- Internal reference key, never shown to an admin — see slugify() in
  -- src/app/[locale]/[academy]/admin/circle-types/actions.ts. Not a display
  -- value, so it does not need to be bilingual.
  slug        text not null check (slug ~ '^[a-z0-9_]{2,40}$'),
  name_ar     text not null check (btrim(name_ar) <> ''),
  name_en     text not null check (btrim(name_en) <> ''),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint uq_circle_types_academy_slug unique (academy_id, slug)
);

create index idx_circle_types_academy on public.circle_types (academy_id) where is_active;

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.circle_types enable row level security;

-- Scoped like `is_admin()`, but to one specific academy: a مشرفة of academy A
-- managing this list must not be able to touch academy B's types. `is_admin()`
-- alone does not carry that distinction, since this schema is multi-academy
-- capable even though only one academy exists today.
create or replace function public.is_admin_of(p_academy_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teachers
     where auth_user_id = auth.uid() and role = 'admin' and is_active
       and academy_id = p_academy_id
  )
$$;

revoke execute on function public.is_admin_of(uuid) from public;
grant  execute on function public.is_admin_of(uuid) to authenticated;

-- Readable by anyone (students see the type name on the public circle page;
-- staff see it when creating or filtering circles). A deactivated type stays
-- visible only to that academy's admin, who is the one who can reactivate it.
create policy circle_types_select on public.circle_types
  for select to anon, authenticated
  using (is_active or public.is_admin_of(academy_id));

create policy circle_types_admin_insert on public.circle_types
  for insert to authenticated
  with check (public.is_admin_of(academy_id));

create policy circle_types_admin_update on public.circle_types
  for update to authenticated
  using (public.is_admin_of(academy_id))
  with check (public.is_admin_of(academy_id));

-- No delete policy. `fk_circles_type` below would block deleting a type still
-- in use, but a type nobody uses yet could still be deleted — deliberately not
-- offered: deactivating is reversible, deleting is not, and there is no
-- reassignment flow for the circles that would be orphaned by allowing it.

-- =============================================================================
-- Seed the existing three types, plus حلقة الحديث, for every current academy.
-- Idempotent — re-running this file does nothing to an academy that already
-- has these rows.
-- =============================================================================

insert into public.circle_types (academy_id, slug, name_ar, name_en)
select a.id, v.slug, v.name_ar, v.name_en
  from public.academies a
  cross join (values
    ('tasheeh',         'حلقة تصحيح التلاوة', 'Recitation correction'),
    ('tajweed',         'حلقة تجويد',          'Tajweed'),
    ('free_recitation', 'تسميع حر',            'Free recitation'),
    ('hadith',          'حلقة الحديث',         'Hadith Circle')
  ) as v(slug, name_ar, name_en)
 on conflict (academy_id, slug) do nothing;

-- =============================================================================
-- circles.type now references circle_types instead of a fixed CHECK list.
--
-- Order matters: the seed above must run first, or validating this FK against
-- existing circles would fail the moment it is added.
-- =============================================================================

alter table public.circles drop constraint if exists circles_type_check;

alter table public.circles
  add constraint fk_circles_type
    foreign key (academy_id, type)
    references public.circle_types (academy_id, slug);
