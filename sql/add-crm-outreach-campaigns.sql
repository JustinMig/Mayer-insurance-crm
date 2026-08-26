-- CRM outreach campaigns: campaign purpose, per-client progress, and permanent interaction history.
create table if not exists public.crm_outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  topic text not null default 'general' check (topic in ('medicare','life','health','retirement','general','other')),
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_outreach_campaign_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  campaign_id uuid not null references public.crm_outreach_campaigns(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  assigned_agent_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'not_contacted' check (status in ('not_contacted','attempted','spoke','follow_up','completed','not_interested','do_not_call','unreachable')),
  last_outcome text,
  last_note text,
  last_contacted_at timestamptz,
  next_action text,
  follow_up_date date,
  follow_up_time time without time zone,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, client_id)
);

create table if not exists public.crm_outreach_interactions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  campaign_id uuid not null references public.crm_outreach_campaigns(id) on delete cascade,
  member_id uuid not null references public.crm_outreach_campaign_members(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  assigned_agent_id uuid not null references public.profiles(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  outcome text not null check (outcome in ('no_answer','voicemail','busy','bad_number','spoke','follow_up','completed','not_interested','do_not_call','unreachable')),
  note text,
  next_action text,
  follow_up_date date,
  follow_up_time time without time zone,
  calendar_event_id uuid references public.workspace_calendar_events(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists crm_outreach_campaigns_agency_status_idx on public.crm_outreach_campaigns (agency_id, status, created_at desc);
create index if not exists crm_outreach_campaigns_created_by_idx on public.crm_outreach_campaigns (created_by);
create index if not exists crm_outreach_members_agency_idx on public.crm_outreach_campaign_members (agency_id);
create index if not exists crm_outreach_members_campaign_status_idx on public.crm_outreach_campaign_members (campaign_id, status, updated_at desc);
create index if not exists crm_outreach_members_agent_status_idx on public.crm_outreach_campaign_members (assigned_agent_id, status, follow_up_date);
create index if not exists crm_outreach_members_client_idx on public.crm_outreach_campaign_members (client_id);
create index if not exists crm_outreach_interactions_agency_idx on public.crm_outreach_interactions (agency_id);
create index if not exists crm_outreach_interactions_campaign_idx on public.crm_outreach_interactions (campaign_id, created_at desc);
create index if not exists crm_outreach_interactions_member_idx on public.crm_outreach_interactions (member_id, created_at desc);
create index if not exists crm_outreach_interactions_client_idx on public.crm_outreach_interactions (client_id, created_at desc);
create index if not exists crm_outreach_interactions_agent_idx on public.crm_outreach_interactions (assigned_agent_id, created_at desc);
create index if not exists crm_outreach_interactions_user_idx on public.crm_outreach_interactions (user_id, created_at desc);
create index if not exists crm_outreach_interactions_calendar_idx on public.crm_outreach_interactions (calendar_event_id) where calendar_event_id is not null;

alter table public.crm_outreach_campaigns enable row level security;
alter table public.crm_outreach_campaign_members enable row level security;
alter table public.crm_outreach_interactions enable row level security;

revoke all on table public.crm_outreach_campaigns from anon, authenticated;
revoke all on table public.crm_outreach_campaign_members from anon, authenticated;
revoke all on table public.crm_outreach_interactions from anon, authenticated;
grant select, insert, update, delete on table public.crm_outreach_campaigns to authenticated;
grant select, insert, update, delete on table public.crm_outreach_campaign_members to authenticated;
grant select, insert on table public.crm_outreach_interactions to authenticated;

create policy "outreach campaigns select" on public.crm_outreach_campaigns for select to authenticated
using (agency_id = (select private.current_agency_id()));
create policy "outreach campaigns insert" on public.crm_outreach_campaigns for insert to authenticated
with check (agency_id = (select private.current_agency_id()) and created_by = (select auth.uid()));
create policy "outreach campaigns update" on public.crm_outreach_campaigns for update to authenticated
using (agency_id = (select private.current_agency_id()) and (created_by = (select auth.uid()) or (select private.current_crm_role()) in ('manager','admin')))
with check (agency_id = (select private.current_agency_id()) and (created_by = (select auth.uid()) or (select private.current_crm_role()) in ('manager','admin')));
create policy "outreach campaigns delete" on public.crm_outreach_campaigns for delete to authenticated
using (agency_id = (select private.current_agency_id()) and (created_by = (select auth.uid()) or (select private.current_crm_role()) in ('manager','admin')));

create policy "outreach members select" on public.crm_outreach_campaign_members for select to authenticated
using (agency_id = (select private.current_agency_id()) and ((select private.current_crm_role()) in ('manager','admin') or assigned_agent_id = (select auth.uid())));
create policy "outreach members insert" on public.crm_outreach_campaign_members for insert to authenticated
with check (
  agency_id = (select private.current_agency_id())
  and ((select private.current_crm_role()) in ('manager','admin') or assigned_agent_id = (select auth.uid()))
  and exists (select 1 from public.crm_outreach_campaigns c where c.id = campaign_id and c.agency_id = (select private.current_agency_id()))
  and exists (select 1 from public.clients cl where cl.id = client_id and cl.agency_id = (select private.current_agency_id()) and cl.assigned_agent_id = assigned_agent_id)
);
create policy "outreach members update" on public.crm_outreach_campaign_members for update to authenticated
using (agency_id = (select private.current_agency_id()) and ((select private.current_crm_role()) in ('manager','admin') or assigned_agent_id = (select auth.uid())))
with check (
  agency_id = (select private.current_agency_id())
  and ((select private.current_crm_role()) in ('manager','admin') or assigned_agent_id = (select auth.uid()))
  and exists (select 1 from public.clients cl where cl.id = client_id and cl.agency_id = (select private.current_agency_id()) and cl.assigned_agent_id = assigned_agent_id)
);
create policy "outreach members delete" on public.crm_outreach_campaign_members for delete to authenticated
using (agency_id = (select private.current_agency_id()) and ((select private.current_crm_role()) in ('manager','admin') or assigned_agent_id = (select auth.uid())));

create policy "outreach interactions select" on public.crm_outreach_interactions for select to authenticated
using (agency_id = (select private.current_agency_id()) and ((select private.current_crm_role()) in ('manager','admin') or assigned_agent_id = (select auth.uid())));
create policy "outreach interactions insert" on public.crm_outreach_interactions for insert to authenticated
with check (
  agency_id = (select private.current_agency_id())
  and user_id = (select auth.uid())
  and ((select private.current_crm_role()) in ('manager','admin') or assigned_agent_id = (select auth.uid()))
  and exists (select 1 from public.crm_outreach_campaign_members m where m.id = member_id and m.campaign_id = campaign_id and m.client_id = client_id and m.assigned_agent_id = assigned_agent_id and m.agency_id = (select private.current_agency_id()))
);

create trigger crm_outreach_campaigns_set_updated_at before update on public.crm_outreach_campaigns
for each row execute function public.set_updated_at();
create trigger crm_outreach_members_set_updated_at before update on public.crm_outreach_campaign_members
for each row execute function public.set_updated_at();