begin;

create table if not exists public.track_cohort_supervisors (
  cohort_id   uuid not null references public.track_cohorts(id) on delete cascade,
  teacher_id  uuid not null references public.teachers(id) on delete cascade,
  assigned_by uuid references public.teachers(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (cohort_id, teacher_id)
);

create index if not exists idx_track_cohort_supervisors_teacher
  on public.track_cohort_supervisors (teacher_id);

comment on table public.track_cohort_supervisors is
  'The مشرفات of a دفعة. Several per دفعة; each must hold the supervisor or admin role in the same academy.';

create or replace function public.is_cohort_supervisor_candidate(p_cohort_id uuid, p_teacher_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.track_cohorts c
      join public.teachers t on t.academy_id = c.academy_id
     where c.id = p_cohort_id
       and t.id = p_teacher_id
       and t.is_active
       and t.roles && array['supervisor', 'admin']::text[]
  )
$$;

revoke execute on function public.is_cohort_supervisor_candidate(uuid, uuid) from public, anon;
grant  execute on function public.is_cohort_supervisor_candidate(uuid, uuid) to authenticated;

alter table public.track_cohort_supervisors enable row level security;

create policy cohort_supervisors_select_staff on public.track_cohort_supervisors
  for select to authenticated
  using (exists (
    select 1 from public.track_cohorts c
     where c.id = cohort_id and public.is_staff_of(c.academy_id)
  ));

create policy cohort_supervisors_insert_supervisor on public.track_cohort_supervisors
  for insert to authenticated
  with check (
    exists (
      select 1 from public.track_cohorts c
       where c.id = cohort_id and public.can_supervise(c.academy_id)
    )
    and public.is_cohort_supervisor_candidate(cohort_id, teacher_id)
  );

create policy cohort_supervisors_delete_supervisor on public.track_cohort_supervisors
  for delete to authenticated
  using (exists (
    select 1 from public.track_cohorts c
     where c.id = cohort_id and public.can_supervise(c.academy_id)
  ));

commit;
