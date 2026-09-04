-- One person, several roles.
--
-- `teachers.role` held exactly one of 'teacher' / 'admin', which could not
-- express the two things the academy actually has: a مشرفة, and a person who
-- is a معلمة *and* a مشرفة (or an admin) at the same time. This adds a `roles`
-- array alongside it and moves every permission decision onto it.
--
-- What each role means, and nothing more:
--   teacher     the baseline every approved person has. Runs her own circles.
--   supervisor  edits ANY circle in her academy, and manages the students.
--   admin       everything, including approving staff and granting roles.
--
-- `role` (singular) is NOT dropped — a lot of code still reads it for display,
-- and dropping it would be a breaking change for no gain. A trigger keeps it
-- in step with the array so the two can never disagree.

-- --- The array ---------------------------------------------------------------

alter table public.teachers
  add column if not exists roles text[] not null default array['teacher'];

alter table public.teachers
  drop constraint if exists teachers_roles_valid;

alter table public.teachers
  add constraint teachers_roles_valid check (
    array_length(roles, 1) between 1 and 3
    and roles <@ array['teacher', 'supervisor', 'admin']::text[]
    and 'teacher' = any(roles)
  );

comment on column public.teachers.roles is
  'Every role this person holds. Always contains teacher; may add supervisor and/or admin.';

-- Backfill from the single role. Everyone keeps what they had, and an existing
-- admin also keeps the teacher baseline so nothing she could do is lost.
update public.teachers
   set roles = case
                 when role = 'admin' then array['teacher', 'admin']
                 else array['teacher']
               end
 where roles = array['teacher'] or roles is null;

-- --- Keeping the legacy column honest ----------------------------------------
-- `role` becomes a derived value: 'admin' when the array says so, else
-- 'teacher'. It is never written by hand again. (Its own CHECK still only
-- allows those two values, which is exactly what this produces.)

-- Reconciles in whichever direction the caller wrote, because both are still
-- written: the registration RPC and the "edit teacher" screen set `role`, the
-- new role buttons set `roles`. Whichever one changed wins, and the other is
-- rebuilt from it — so neither an old code path nor a new one can leave the
-- two disagreeing.

create or replace function public.sync_primary_role()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- An insert that named a role but not the array (every current caller)
    -- gets the array built from it.
    if new.roles is null or new.roles = array['teacher'] then
      new.roles := case
                     when new.role = 'admin' then array['teacher', 'admin']
                     else array['teacher']
                   end;
    end if;
  elsif new.roles is not distinct from old.roles
        and new.role is distinct from old.role then
    -- Only the legacy column moved: an older code path granting or removing
    -- admin. Mirror it into the array.
    new.roles := case
                   when new.role = 'admin' then old.roles || array['admin']
                   else array_remove(old.roles, 'admin')
                 end;
    if not ('teacher' = any(new.roles)) then
      new.roles := new.roles || array['teacher'];
    end if;
    -- `||` can repeat a role that was already there.
    new.roles := (select array(select distinct unnest(new.roles)));
  end if;

  new.role := case when 'admin' = any(new.roles) then 'admin' else 'teacher' end;
  return new;
end
$$;

drop trigger if exists teachers_sync_primary_role on public.teachers;
create trigger teachers_sync_primary_role
  before insert or update on public.teachers
  for each row execute function public.sync_primary_role();

-- --- Permission helpers ------------------------------------------------------

create or replace function public.has_role(p_role text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teachers
     where auth_user_id = auth.uid() and is_active and p_role = any(roles)
  )
$$;

-- Redefined, not replaced: 33 existing policies call is_admin() and keep
-- working unchanged — it just reads the array now instead of the column.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role('admin')
$$;

-- Academy-scoped: a supervisor supervises HER academy, not every academy on
-- the platform. An admin passes this for her own academy too.
create or replace function public.can_supervise(p_academy_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teachers
     where auth_user_id = auth.uid()
       and is_active
       and academy_id = p_academy_id
       and (roles && array['supervisor', 'admin']::text[])
  )
$$;

comment on function public.can_supervise(uuid) is
  'Supervisor or admin of that one academy.';

revoke execute on function public.has_role(text) from public;
revoke execute on function public.can_supervise(uuid) from public;
grant  execute on function public.has_role(text) to authenticated;
grant  execute on function public.can_supervise(uuid) to authenticated;

-- --- Circles: editing goes back to a defined group ---------------------------
-- Replaces the temporary "any approved staff member" rule. A teacher edits her
-- own circles; a supervisor or admin edits any circle in her academy.

drop policy if exists circles_update_staff on public.circles;
drop policy if exists circles_update_own_or_admin on public.circles;

create policy circles_update_own_or_supervisor on public.circles
  for update to authenticated
  using (
    teacher_id = public.current_teacher_id()
    or public.can_supervise(academy_id)
  )
  with check (
    teacher_id = public.current_teacher_id()
    or public.can_supervise(academy_id)
  );

-- --- Students: supervisors manage the roster ---------------------------------

drop policy if exists students_admin_update on public.students;
create policy students_supervisor_update on public.students
  for update to authenticated
  using (public.can_supervise(academy_id))
  with check (public.can_supervise(academy_id));

drop policy if exists students_admin_delete on public.students;
create policy students_supervisor_delete on public.students
  for delete to authenticated
  using (public.can_supervise(academy_id));

-- --- Nobody promotes herself -------------------------------------------------
-- `teachers_update_self_or_admin` lets a person update her own row, which is
-- what the profile screens rely on. With permissions living in that same row,
-- that would also have let any signed-in teacher grant herself admin — so the
-- privileged columns are locked to admins here, at the table, rather than
-- trusted to the screens that write them.
--
-- (This closes the same hole for `role` and `is_active`, which the single-role
-- column already had before this migration.)

create or replace function public.guard_privileged_teacher_columns()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- No signed-in user means this is server-side maintenance running on the
  -- service key (account creation, password reset). RLS has already refused
  -- every anonymous write to this table, so there is nothing left to guard.
  if auth.uid() is null then
    return new;
  end if;

  if (new.roles is distinct from old.roles
      or new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.academy_id is distinct from old.academy_id)
     and not public.is_admin()
  then
    raise exception 'only an admin may change roles, activation or academy'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists teachers_guard_privileged on public.teachers;
create trigger teachers_guard_privileged
  before update on public.teachers
  for each row execute function public.guard_privileged_teacher_columns();
