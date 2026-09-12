-- The mushaf.
--
-- WHY THE TEXT LIVES HERE AND NOT IN A RUNTIME API CALL:
--
-- A student opening the mushaf in a circle cannot have the page depend on a
-- third party being up. It is also the one content in this app that must never
-- change unnoticed — so it is fetched once, checked, and stored, and from then
-- on the app reads its own copy.
--
-- SOURCE AND LICENCE: the Uthmani text published by Tanzil (tanzil.net),
-- fetched through alquran.cloud's `quran-uthmani` edition. Tanzil permits
-- non-commercial use provided the text is NOT MODIFIED and is attributed —
-- both of which this codebase takes literally:
--
--   * The seeding script writes each ayah exactly as received, apart from
--     stripping a byte-order mark, which is an encoding artefact and not part
--     of the text.
--   * Nothing in the app ever inserts a symbol into an ayah. That rule was
--     learnt the hard way: ۩ and ۞ are INSIDE the text, and an earlier attempt
--     to "add" them produced ۩۩.
--   * The attribution is rendered on the mushaf screen itself.
--
-- If the academy ever charges for access, this licence has to be revisited.
--
-- The page numbers are the King Fahd Complex layout (604 pages) — the mushaf
-- the students actually hold, and the one every "صفحة ٢٩٣" in this app means.

create table public.quran_ayahs (
  surah        smallint not null check (surah between 1 and 114),
  ayah         smallint not null check (ayah >= 1),
  page         smallint not null check (page between 1 and 604),
  juz          smallint not null check (juz between 1 and 30),
  -- Whether this ayah carries a سجدة. The ۩ itself is already in `text`; this
  -- is for highlighting it, never for inserting it.
  sajda        boolean  not null default false,
  text         text     not null check (btrim(text) <> ''),
  primary key (surah, ayah)
);

create index idx_quran_ayahs_page on public.quran_ayahs (page, surah, ayah);
create index idx_quran_ayahs_juz  on public.quran_ayahs (juz);

alter table public.quran_ayahs enable row level security;

-- The Quran is public. Everyone reads; nobody writes through the API — the
-- table is seeded once with the service role and then left alone. There is
-- deliberately no insert, update or delete policy at all, so even a signed-in
-- admin cannot alter an ayah from inside the app.
create policy quran_ayahs_read on public.quran_ayahs
  for select to anon, authenticated
  using (true);

-- =============================================================================
-- Reading it
-- =============================================================================

-- One page of the mushaf, with the surah headings it needs. A page that opens
-- a new surah has to draw its title and, for all but التوبة, its البسملة —
-- so the caller is told which ayah numbers start a surah rather than having to
-- work it out.
create or replace function public.mushaf_page(p_page int)
returns table (
  surah        smallint,
  ayah         smallint,
  juz          smallint,
  sajda        boolean,
  text         text,
  starts_surah boolean
)
language sql stable security definer set search_path = public
as $$
  select q.surah, q.ayah, q.juz, q.sajda, q.text, (q.ayah = 1)
    from public.quran_ayahs q
   where q.page = p_page
   order by q.surah, q.ayah;
$$;

revoke execute on function public.mushaf_page(int) from public;
grant  execute on function public.mushaf_page(int) to anon, authenticated;

-- Which page a reference opens on — how "اقرئي" from a recitation log or a
-- juz cell lands the reader in the right place.
create or replace function public.mushaf_page_of(p_surah int, p_ayah int)
returns int
language sql stable security definer set search_path = public
as $$
  select q.page from public.quran_ayahs q
   where q.surah = p_surah and q.ayah = p_ayah;
$$;

revoke execute on function public.mushaf_page_of(int, int) from public;
grant  execute on function public.mushaf_page_of(int, int) to anon, authenticated;

-- A range of ayat, for the self-test: it needs the actual words, and it needs
-- them without the caller being able to ask for the whole mushaf in one go.
create or replace function public.quran_range(
  p_from_surah int, p_from_ayah int,
  p_to_surah   int, p_to_ayah   int
)
returns table (
  surah smallint,
  ayah  smallint,
  page  smallint,
  juz   smallint,
  text  text
)
language sql stable security definer set search_path = public
as $$
  select q.surah, q.ayah, q.page, q.juz, q.text
    from public.quran_ayahs q
   where (q.surah, q.ayah) >= (p_from_surah::smallint, p_from_ayah::smallint)
     and (q.surah, q.ayah) <= (p_to_surah::smallint,   p_to_ayah::smallint)
   order by q.surah, q.ayah
   -- A حزب is about 250 ayat; this is generous for any single test and still
   -- refuses "give me the Quran" as one request.
   limit 500;
$$;

revoke execute on function public.quran_range(int, int, int, int) from public;
grant  execute on function public.quran_range(int, int, int, int) to anon, authenticated;

comment on table public.quran_ayahs is
  'Uthmani text from Tanzil (tanzil.net), unmodified. Non-commercial use.';
