-- Preserve permanent outreach history when a client is removed from an active campaign.
alter table public.crm_outreach_interactions drop constraint if exists crm_outreach_interactions_member_id_fkey;
alter table public.crm_outreach_interactions alter column member_id drop not null;
alter table public.crm_outreach_interactions add constraint crm_outreach_interactions_member_id_fkey
  foreign key (member_id) references public.crm_outreach_campaign_members(id) on delete set null;
