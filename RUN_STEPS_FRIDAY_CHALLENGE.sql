create table if not exists public.friday_challenge_entries (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  friday      date not null,
  student_id  uuid references public.students(id) on delete cascade,
  teacher_id  uuid references public.teachers(id) on delete cascade,
  salawat     integer not null default 0 check (salawat between 0 and 100000),
  kahf_pages  integer not null default 0 check (kahf_pages between 0 and 4095),
  salawat_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint friday_challenge_one_person check (num_nonnulls(student_id, teacher_id) = 1),
  constraint friday_challenge_is_friday check (extract(isodow from friday) = 5)
);

create unique index if not exists friday_challenge_student_week
  on public.friday_challenge_entries (friday, student_id) where student_id is not null;
create unique index if not exists friday_challenge_teacher_week
  on public.friday_challenge_entries (friday, teacher_id) where teacher_id is not null;
create index if not exists friday_challenge_board
  on public.friday_challenge_entries (academy_id, friday, salawat desc);

alter table public.friday_challenge_entries enable row level security;
revoke all on public.friday_challenge_entries from anon, authenticated;

create or replace function public.friday_challenge_valid_friday(p_friday date)
returns boolean
language sql immutable
as $$
  select p_friday is not null
     and extract(isodow from p_friday) = 5
$$;

create or replace function public.friday_challenge_save_student(
  p_student_id uuid,
  p_phone      text,
  p_friday     date,
  p_salawat    integer,
  p_kahf       integer
)
returns table (salawat integer, kahf_pages integer)
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_given   text;
begin
  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_given := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if v_student.phone_key is null
     or char_length(v_given) < 9
     or (v_student.phone_key <> v_given
         and right(v_student.phone_key, 9) <> right(v_given, 9)) then
    raise exception 'phone_mismatch' using errcode = '42501';
  end if;

  if not public.friday_challenge_valid_friday(p_friday)
     or p_friday not between current_date - 1 and current_date + 1 then
    raise exception 'not_this_friday' using errcode = '22023';
  end if;

  insert into public.friday_challenge_entries as e
         (academy_id, friday, student_id, salawat, kahf_pages)
  values (v_student.academy_id, p_friday, p_student_id,
          least(greatest(coalesce(p_salawat, 0), 0), 100000),
          coalesce(p_kahf, 0) & 4095)
  on conflict (friday, student_id) where student_id is not null
  do update set
    salawat    = greatest(e.salawat, excluded.salawat),
    kahf_pages = e.kahf_pages | excluded.kahf_pages,
    salawat_at = case when excluded.salawat > e.salawat then now() else e.salawat_at end,
    updated_at = now();

  return query
    select e.salawat, e.kahf_pages
      from public.friday_challenge_entries e
     where e.friday = p_friday and e.student_id = p_student_id;
end
$$;

revoke execute on function public.friday_challenge_save_student(uuid, text, date, integer, integer) from public;
grant  execute on function public.friday_challenge_save_student(uuid, text, date, integer, integer) to anon, authenticated;

create or replace function public.friday_challenge_save_staff(
  p_friday  date,
  p_salawat integer,
  p_kahf    integer
)
returns table (salawat integer, kahf_pages integer)
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_teacher public.teachers%rowtype;
begin
  select * into v_teacher
    from public.teachers
   where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  if not public.friday_challenge_valid_friday(p_friday)
     or p_friday not between current_date - 1 and current_date + 1 then
    raise exception 'not_this_friday' using errcode = '22023';
  end if;

  insert into public.friday_challenge_entries as e
         (academy_id, friday, teacher_id, salawat, kahf_pages)
  values (v_teacher.academy_id, p_friday, v_teacher.id,
          least(greatest(coalesce(p_salawat, 0), 0), 100000),
          coalesce(p_kahf, 0) & 4095)
  on conflict (friday, teacher_id) where teacher_id is not null
  do update set
    salawat    = greatest(e.salawat, excluded.salawat),
    kahf_pages = e.kahf_pages | excluded.kahf_pages,
    salawat_at = case when excluded.salawat > e.salawat then now() else e.salawat_at end,
    updated_at = now();

  return query
    select e.salawat, e.kahf_pages
      from public.friday_challenge_entries e
     where e.friday = p_friday and e.teacher_id = v_teacher.id;
end
$$;

revoke execute on function public.friday_challenge_save_staff(date, integer, integer) from public;
grant  execute on function public.friday_challenge_save_staff(date, integer, integer) to authenticated;

create or replace function public.friday_challenge_board(
  p_academy_id uuid,
  p_friday     date
)
returns table (
  name       text,
  kind       text,
  salawat    integer,
  kahf_pages integer,
  salawat_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_supervise(p_academy_id) then
    raise exception 'not_supervisor' using errcode = '42501';
  end if;

  return query
    select coalesce(
             case when s.id is not null then
               s.name || case when nullif(btrim(s.father_name), '-') is not null
                              then ' ' || btrim(s.father_name) else '' end
             end,
             t.name
           ) as name,
           case
             when s.id is not null then 'student'
             when t.roles && array['supervisor', 'admin']::text[] then 'supervisor'
             else 'teacher'
           end as kind,
           e.salawat, e.kahf_pages, e.salawat_at
      from public.friday_challenge_entries e
      left join public.students s on s.id = e.student_id
      left join public.teachers t on t.id = e.teacher_id
     where e.academy_id = p_academy_id
       and e.friday = p_friday
       and (e.salawat > 0 or e.kahf_pages > 0)
     order by e.salawat desc, e.salawat_at asc;
end
$$;

revoke execute on function public.friday_challenge_board(uuid, date) from public;
grant  execute on function public.friday_challenge_board(uuid, date) to authenticated;
