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

update public.teachers
   set roles = case
                 when role = 'admin' then array['teacher', 'admin']
                 else array['teacher']
               end
 where roles = array['teacher'] or roles is null;

create or replace function public.sync_primary_role()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.roles is null or new.roles = array['teacher'] then
      new.roles := case
                     when new.role = 'admin' then array['teacher', 'admin']
                     else array['teacher']
                   end;
    end if;
  elsif new.roles is not distinct from old.roles
        and new.role is distinct from old.role then
    new.roles := case
                   when new.role = 'admin' then old.roles || array['admin']
                   else array_remove(old.roles, 'admin')
                 end;
    if not ('teacher' = any(new.roles)) then
      new.roles := new.roles || array['teacher'];
    end if;
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

create or replace function public.has_role(p_role text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.teachers
     where auth_user_id = auth.uid() and is_active and p_role = any(roles)
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role('admin')
$$;

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

drop policy if exists students_admin_update on public.students;
create policy students_supervisor_update on public.students
  for update to authenticated
  using (public.can_supervise(academy_id))
  with check (public.can_supervise(academy_id));

drop policy if exists students_admin_delete on public.students;
create policy students_supervisor_delete on public.students
  for delete to authenticated
  using (public.can_supervise(academy_id));

create or replace function public.guard_privileged_teacher_columns()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
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
