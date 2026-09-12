-- Temporary diagnostic, dropped again by the migration that follows it.
--
-- A live circle is running and two things are broken: a مشرفة cannot change a
-- student's recitation status, and the queue is not updating for everyone. The
-- prime suspect is the migration-history repair done earlier in this project:
-- 21 migrations were marked "applied" after probing a sample of their objects,
-- and the two files that would cause exactly these symptoms —
-- 20260904200000 (supervisor attendance policies) and 20260907120000 (replica
-- identity for Realtime) — were among the ones NOT probed.
--
-- Guessing would mean rewriting policies on a live database while a class is
-- in session. This reads what is actually there first. service_role only.

create or replace function public.debug_policy_state()
returns table (kind text, name text, detail text)
language sql stable security definer set search_path = public, pg_catalog
as $$
  select 'policy'::text,
         (p.tablename || '.' || p.policyname)::text,
         (p.cmd || ' | using=' || coalesce(p.qual, '-'))::text
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename in ('attendance_records', 'circles')
  union all
  select 'replica_identity'::text,
         c.relname::text,
         case c.relreplident
           when 'd' then 'default (primary key only)'
           when 'f' then 'full'
           when 'n' then 'nothing'
           else c.relreplident::text
         end
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'attendance_records'
  union all
  select 'realtime_publication'::text,
         pt.tablename::text,
         'in supabase_realtime'::text
    from pg_publication_tables pt
   where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
  union all
  select 'function'::text, p.proname::text,
         pg_get_function_identity_arguments(p.oid)::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('reorder_queue', 'can_supervise', 'is_staff_of');
$$;

revoke execute on function public.debug_policy_state() from public;
revoke execute on function public.debug_policy_state() from anon;
revoke execute on function public.debug_policy_state() from authenticated;
