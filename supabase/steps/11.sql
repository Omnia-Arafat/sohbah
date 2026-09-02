create index if not exists idx_students_phone_per_academy
  on public.students (academy_id, phone_key)
  where phone_key is not null;
