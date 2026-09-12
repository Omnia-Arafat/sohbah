-- Phone numbers are stored in E.164, so one line is one key.
--
-- 20260830140000 left this open on purpose and named the consequence:
--
--     LIMITATION: this does not resolve country codes. A student entering
--     "0501234567" locally and "+966501234567" later produces two different
--     keys and can still register twice.
--
-- That is exactly what happened. By 2026-09-12 the sohbah academy held أم وائل
-- as "+20 11 41649134" and Om wael as "01141649134" — one woman, one line, two
-- rows, and `find_similar_students()` never fired because `phone_key` saw two
-- different numbers. Alongside it sat a pile of unusable numbers: a Saudi
-- mobile written "0966548132476", a Sudanese one as "00249908357170", Yemeni
-- numbers with no country code at all, and an Egyptian number a digit short.
--
-- The fix is not a per-academy default country code (which would have been
-- wrong anyway — these students are Egyptian, Saudi, Yemeni, Sudanese and
-- Moroccan). It is that the form now asks which country the number belongs to
-- and validates the national number against that country's own length and
-- mobile prefix. See `src/lib/phone.ts`; the picker is `PhoneField`.
--
-- `normalize_phone()` keeps its digits-only definition — it is the immutable
-- backing of the generated `phone_key` column, and changing it would mean
-- dropping and rebuilding that column and its index. It does not need to
-- change: once every row is written as '+<dial><national>', digits-only is
-- already canonical.

comment on function public.normalize_phone(text) is
  'Immutable digits-only phone key used for students.phone_key. Canonical as '
  'long as callers store E.164 (see students_phone_e164 and src/lib/phone.ts); '
  'this function resolves punctuation, not country codes.';

-- NOT VALID, in the same spirit as `students_phone_required` above it: rows
-- predating the country picker are still readable, while every insert and
-- update from here on must carry a country code.
--
-- Egypt's '+20…' is 12 digits and Comoros' is 10, so the range is wide by
-- design — E.164 caps the whole number at 15. The real per-country rule lives
-- in the form, where it can say which country it is judging against.
--
-- Once the legacy rows are converted, promote it:
--     alter table public.students validate constraint students_phone_e164;
--
-- Find the rows that still need converting:
--     select id, name, phone from public.students
--      where phone is not null and phone !~ '^\+[1-9]\d{6,14}$';
alter table public.students
  drop constraint if exists students_phone_e164;

alter table public.students
  add constraint students_phone_e164
    check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$') not valid;
