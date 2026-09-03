create table public.circle_types (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,

  slug        text not null check (slug ~ '^[a-z0-9_]{2,40}$'),
  name_ar     text not null check (btrim(name_ar) <> ''),
  name_en     text not null check (btrim(name_en) <> ''),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint uq_circle_types_academy_slug unique (academy_id, slug)
);


create index idx_circle_types_academy on public.circle_types (academy_id) where is_active;


alter table public.circle_types enable row level security;


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


alter table public.circles drop constraint if exists circles_type_check;


alter table public.circles
  add constraint fk_circles_type
    foreign key (academy_id, type)
    references public.circle_types (academy_id, slug);
