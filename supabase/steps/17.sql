alter table public.teachers
  add column if not exists phone_key text
    generated always as (public.normalize_phone(phone)) stored;
