-- Mayer Insurance Group CRM - final performance optimization
-- Applied to production Supabase on 2026-08-08.
-- Kept here so the Git repository documents the production database state.

create index if not exists audit_log_actor_id_idx on public.audit_log(actor_id);
create index if not exists audit_log_agency_id_idx on public.audit_log(agency_id);
create index if not exists medicare_info_agency_id_idx on public.medicare_info(agency_id);
create index if not exists profiles_agency_id_idx on public.profiles(agency_id);

alter policy "authorized users write audit" on public.audit_log
  with check ((agency_id = (select private.current_agency_id())) and (actor_id = (select auth.uid())));

alter policy "authorized users insert clients" on public.clients
  with check (
    (agency_id = (select private.current_agency_id()))
    and (
      (assigned_agent_id = (select auth.uid()))
      or ((select private.current_crm_role()) = any (array['admin'::text,'manager'::text]))
    )
  );

alter policy "authorized users update clients" on public.clients
  using (
    (agency_id = (select private.current_agency_id()))
    and (
      ((select private.current_crm_role()) = any (array['admin'::text,'manager'::text]))
      or (assigned_agent_id = (select auth.uid()))
    )
  )
  with check (
    (agency_id = (select private.current_agency_id()))
    and (
      ((select private.current_crm_role()) = any (array['admin'::text,'manager'::text]))
      or (assigned_agent_id = (select auth.uid()))
    )
  );

alter policy "authorized users view clients" on public.clients
  using (
    (agency_id = (select private.current_agency_id()))
    and (
      ((select private.current_crm_role()) = any (array['admin'::text,'manager'::text]))
      or (assigned_agent_id = (select auth.uid()))
    )
  );

-- Consolidate profile permissions so the same SELECT/UPDATE request does not
-- evaluate overlapping permissive policies.
drop policy if exists "admins manage agency profiles" on public.profiles;
drop policy if exists "users can update own profile" on public.profiles;
drop policy if exists "admins insert agency profiles" on public.profiles;
drop policy if exists "authorized users update profiles" on public.profiles;
drop policy if exists "admins delete agency profiles" on public.profiles;

create policy "admins insert agency profiles" on public.profiles
for insert to authenticated
with check (
  (agency_id = (select private.current_agency_id()))
  and ((select private.current_crm_role()) = any (array['admin'::text,'manager'::text]))
);

create policy "authorized users update profiles" on public.profiles
for update to authenticated
using (
  (agency_id = (select private.current_agency_id()))
  and (
    ((select private.current_crm_role()) = any (array['admin'::text,'manager'::text]))
    or (id = (select auth.uid()))
  )
)
with check (
  (agency_id = (select private.current_agency_id()))
  and (
    ((select private.current_crm_role()) = any (array['admin'::text,'manager'::text]))
    or (
      (id = (select auth.uid()))
      and (role = (select p.role from public.profiles p where p.id = (select auth.uid())))
      and (active = (select p.active from public.profiles p where p.id = (select auth.uid())))
    )
  )
);

create policy "admins delete agency profiles" on public.profiles
for delete to authenticated
using (
  (agency_id = (select private.current_agency_id()))
  and ((select private.current_crm_role()) = any (array['admin'::text,'manager'::text]))
);
