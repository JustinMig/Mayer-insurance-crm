-- Agent-scope Outreach campaigns so agents only see/work their own campaigns,
-- while CRM managers retain agency-wide oversight.

alter table public.crm_outreach_campaigns
  add column if not exists assigned_agent_id uuid;

update public.crm_outreach_campaigns c
set assigned_agent_id = owners.assigned_agent_id
from (
  select campaign_id, min(assigned_agent_id::text)::uuid as assigned_agent_id
  from public.crm_outreach_campaign_members
  group by campaign_id
  having count(distinct assigned_agent_id) = 1
) owners
where c.id = owners.campaign_id
  and c.assigned_agent_id is null;

update public.crm_outreach_campaigns
set assigned_agent_id = created_by
where assigned_agent_id is null;

alter table public.crm_outreach_campaigns
  alter column assigned_agent_id set not null;

alter table public.crm_outreach_campaigns
  drop constraint if exists crm_outreach_campaigns_assigned_agent_id_fkey;

alter table public.crm_outreach_campaigns
  add constraint crm_outreach_campaigns_assigned_agent_id_fkey
  foreign key (assigned_agent_id) references public.profiles(id) on delete restrict;

create index if not exists crm_outreach_campaigns_assigned_agent_idx
  on public.crm_outreach_campaigns (assigned_agent_id);

create index if not exists crm_outreach_campaigns_agent_status_created_idx
  on public.crm_outreach_campaigns (agency_id, assigned_agent_id, status, created_at desc);

drop policy if exists "outreach campaigns select" on public.crm_outreach_campaigns;
drop policy if exists "outreach campaigns insert" on public.crm_outreach_campaigns;
drop policy if exists "outreach campaigns update" on public.crm_outreach_campaigns;
drop policy if exists "outreach campaigns delete" on public.crm_outreach_campaigns;

create policy "outreach campaigns select" on public.crm_outreach_campaigns
for select to authenticated
using (
  auth.uid() is not null
  and agency_id = (select private.current_agency_id())
  and ((select private.current_crm_role()) = 'manager' or assigned_agent_id = (select auth.uid()))
);

create policy "outreach campaigns insert" on public.crm_outreach_campaigns
for insert to authenticated
with check (
  auth.uid() is not null
  and agency_id = (select private.current_agency_id())
  and created_by = (select auth.uid())
  and ((select private.current_crm_role()) = 'manager' or assigned_agent_id = (select auth.uid()))
);

create policy "outreach campaigns update" on public.crm_outreach_campaigns
for update to authenticated
using (
  auth.uid() is not null
  and agency_id = (select private.current_agency_id())
  and ((select private.current_crm_role()) = 'manager' or assigned_agent_id = (select auth.uid()))
)
with check (
  auth.uid() is not null
  and agency_id = (select private.current_agency_id())
  and ((select private.current_crm_role()) = 'manager' or assigned_agent_id = (select auth.uid()))
);

create policy "outreach campaigns delete" on public.crm_outreach_campaigns
for delete to authenticated
using (
  auth.uid() is not null
  and agency_id = (select private.current_agency_id())
  and ((select private.current_crm_role()) = 'manager' or assigned_agent_id = (select auth.uid()))
);

drop policy if exists "outreach members select" on public.crm_outreach_campaign_members;
drop policy if exists "outreach members insert" on public.crm_outreach_campaign_members;
drop policy if exists "outreach members update" on public.crm_outreach_campaign_members;
drop policy if exists "outreach members delete" on public.crm_outreach_campaign_members;

create policy "outreach members select" on public.crm_outreach_campaign_members
for select to authenticated
using (
  auth.uid() is not null
  and agency_id = (select private.current_agency_id())
  and ((select private.current_crm_role()) = 'manager' or assigned_agent_id = (select auth.uid()))
);

create policy "outreach members insert" on public.crm_outreach_campaign_members
for insert to authenticated
with check (
  auth.uid() is not null
  and agency_id = (select private.current_agency_id())
  and ((select private.current_crm_role()) = 'manager' or assigned_agent_id = (select auth.uid()))
  and exists (
    select 1 from public.crm_outreach_campaigns c
    where c.id = crm_outreach_campaign_members.campaign_id
      and c.agency_id = (select private.current_agency_id())
      and c.assigned_agent_id = crm_outreach_campaign_members.assigned_agent_id
  )
  and exists (
    select 1 from public.clients cl
    where cl.id = crm_outreach_campaign_members.client_id
      and cl.agency_id = (select private.current_agency_id())
      and cl.assigned_agent_id = crm_outreach_campaign_members.assigned_agent_id
  )
);

create policy "outreach members update" on public.crm_outreach_campaign_members
for update to authenticated
using (
  auth.uid() is not null
  and agency_id = (select private.current_agency_id())
  and ((select private.current_crm_role()) = 'manager' or assigned_agent_id = (select auth.uid()))
)
with check (
  auth.uid() is not null
  and agency_id = (select private.current_agency_id())
  and ((select private.current_crm_role()) = 'manager' or assigned_agent_id = (select auth.uid()))
  and exists (
    select 1 from public.crm_outreach_campaigns c
    where c.id = crm_outreach_campaign_members.campaign_id
      and c.agency_id = (select private.current_agency_id())
      and c.assigned_agent_id = crm_outreach_campaign_members.assigned_agent_id
  )
  and exists (
    select 1 from public.clients cl
    where cl.id = crm_outreach_campaign_members.client_id
      and cl.agency_id = (select private.current_agency_id())
      and cl.assigned_agent_id = crm_outreach_campaign_members.assigned_agent_id
  )
);

create policy "outreach members delete" on public.crm_outreach_campaign_members
for delete to authenticated
using (
  auth.uid() is not null
  and agency_id = (select private.current_agency_id())
  and ((select private.current_crm_role()) = 'manager' or assigned_agent_id = (select auth.uid()))
);

drop policy if exists "outreach interactions select" on public.crm_outreach_interactions;
drop policy if exists "outreach interactions insert" on public.crm_outreach_interactions;

create policy "outreach interactions select" on public.crm_outreach_interactions
for select to authenticated
using (
  auth.uid() is not null
  and agency_id = (select private.current_agency_id())
  and ((select private.current_crm_role()) = 'manager' or assigned_agent_id = (select auth.uid()))
);

create policy "outreach interactions insert" on public.crm_outreach_interactions
for insert to authenticated
with check (
  auth.uid() is not null
  and agency_id = (select private.current_agency_id())
  and user_id = (select auth.uid())
  and ((select private.current_crm_role()) = 'manager' or assigned_agent_id = (select auth.uid()))
  and exists (
    select 1 from public.crm_outreach_campaign_members m
    where m.id = crm_outreach_interactions.member_id
      and m.campaign_id = crm_outreach_interactions.campaign_id
      and m.client_id = crm_outreach_interactions.client_id
      and m.assigned_agent_id = crm_outreach_interactions.assigned_agent_id
      and m.agency_id = (select private.current_agency_id())
  )
);
