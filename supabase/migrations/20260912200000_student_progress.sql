-- Cumulative progress: "فاطمة حفظت ١٨ من ٤٠".
--
-- The queue already records that a student recited today
-- (`attendance_records.recitation_status = 'done'`), and `circle_sessions`
-- records which unit the circle was on. What neither can answer is the
-- question a مشرفة actually asks at the end of a month: how far through the
-- منهج has each student got.
--
-- Answering it by joining those two tables at read time would be wrong, not
-- just slow: the day's unit can be changed after the fact, and a student who
-- recited حديث ١٢ on Tuesday should keep حديث ١٢ even if the معلمة later fixes
-- Tuesday's lesson to ١٣. So the fact is recorded when it happens.

create table public.student_unit_progress (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  unit_id    uuid not null references public.curriculum_units(id) on delete cascade,
  circle_id  uuid references public.circles(id) on delete set null,
  status     text not null default 'recited'
               check (status in ('taught', 'recited', 'memorized')),
  score      numeric(5,2),
  notes      text,
  marked_by  uuid references public.teachers(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- One row per student per unit: reciting the same حديث twice is progress
  -- confirmed, not progress doubled.
  constraint uq_student_unit unique (student_id, unit_id)
);

create index idx_progress_student on public.student_unit_progress (student_id);
create index idx_progress_unit    on public.student_unit_progress (unit_id);

alter table public.student_unit_progress enable row level security;

-- Staff of the academy that owns the student. Students never read this table —
-- it is a teaching record, and there is no student-facing view of it.
create policy progress_select_staff on public.student_unit_progress
  for select to authenticated
  using (exists (select 1 from public.students s
                  where s.id = student_unit_progress.student_id
                    and public.is_staff_of(s.academy_id)));

create policy progress_write_staff on public.student_unit_progress
  for all to authenticated
  using (exists (select 1 from public.students s
                  where s.id = student_unit_progress.student_id
                    and public.is_staff_of(s.academy_id)))
  with check (exists (select 1 from public.students s
                       where s.id = student_unit_progress.student_id
                         and public.is_staff_of(s.academy_id)));

-- =============================================================================
-- Recording it automatically
--
-- The معلمة already marks a student 'done' in the queue — that is the moment
-- the recitation happened, and asking her to record the same fact twice is how
-- the second record ends up empty. So a trigger writes it.
-- =============================================================================

create or replace function public.record_recitation_progress()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_unit_id uuid;
begin
  -- Only on the transition into 'done'. An update that leaves it 'done'
  -- (reordering the queue, say) must not keep rewriting the row.
  if new.recitation_status is distinct from 'done'
     or old.recitation_status is not distinct from 'done' then
    return new;
  end if;

  select cs.unit_id into v_unit_id
    from public.circle_sessions cs
   where cs.circle_id = new.circle_id
     and cs.session_date = new.session_date;

  -- No lesson set for the day — a تسميع حر circle, or a معلمة who did not pick
  -- one. There is nothing to attribute the recitation to, and inventing a unit
  -- would be worse than recording nothing.
  if v_unit_id is null then
    return new;
  end if;

  insert into public.student_unit_progress (student_id, unit_id, circle_id, status)
  values (new.student_id, v_unit_id, new.circle_id, 'recited')
  on conflict (student_id, unit_id) do update
    set status = 'recited',
        circle_id = excluded.circle_id,
        updated_at = now();

  return new;
end
$$;

create trigger trg_attendance_records_progress
  after update of recitation_status on public.attendance_records
  for each row execute function public.record_recitation_progress();

-- =============================================================================
-- The report
-- =============================================================================

create or replace function public.curriculum_progress_report(
  p_academy_id    uuid,
  p_curriculum_id uuid default null,
  p_circle_id     uuid default null,
  p_gender        text default null
)
returns table (
  student_id      uuid,
  student_name    text,
  father_name     text,
  gender_category text,
  curriculum_id   uuid,
  curriculum_ar   text,
  curriculum_en   text,
  units_done      bigint,
  units_total     bigint,
  last_unit_ar    text,
  last_at         timestamptz
)
language sql stable security definer set search_path = public
as $$
  with scope as (
    select cur.id, cur.name_ar, cur.name_en,
           (select count(*) from public.curriculum_units u
             where u.curriculum_id = cur.id and u.is_active) as total
      from public.curricula cur
     where cur.academy_id = p_academy_id
       and (p_curriculum_id is null or cur.id = p_curriculum_id)
  )
  select s.id, s.name, s.father_name, s.gender_category,
         scope.id, scope.name_ar, scope.name_en,
         count(p.id), max(scope.total),
         -- The furthest unit reached, which reads better on a report than the
         -- most recently marked one.
         (array_agg(u.title_ar order by u.position desc))[1],
         max(p.updated_at)
    from public.student_unit_progress p
    join public.curriculum_units u on u.id = p.unit_id
    join scope on scope.id = u.curriculum_id
    join public.students s on s.id = p.student_id
   where public.is_staff_of(p_academy_id)      -- non-staff get an empty result
     and s.academy_id = p_academy_id
     and (p_circle_id is null or p.circle_id = p_circle_id)
     and (p_gender    is null or s.gender_category = p_gender)
   group by s.id, s.name, s.father_name, s.gender_category,
            scope.id, scope.name_ar, scope.name_en
   order by count(p.id) desc, s.name;
$$;

revoke execute on function public.curriculum_progress_report(uuid, uuid, uuid, text) from public;
revoke execute on function public.curriculum_progress_report(uuid, uuid, uuid, text) from anon;
grant  execute on function public.curriculum_progress_report(uuid, uuid, uuid, text) to authenticated;
