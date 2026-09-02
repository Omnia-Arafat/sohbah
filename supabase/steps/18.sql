create unique index if not exists uq_teachers_phone_per_academy
  on public.teachers (academy_id, phone_key)
  where phone_key is not null;
