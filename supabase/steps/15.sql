alter table public.students
  add constraint students_phone_required
    check (public.normalize_phone(phone) is not null) not valid;
