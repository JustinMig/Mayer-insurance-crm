-- Added for the MayerIG.com Squarespace -> Justin CRM form bridge.
-- Keeps Justin's unread form-submission badge/count query fast.
create index if not exists website_leads_assigned_unread_created_idx
on public.website_leads (assigned_agent_id, created_at desc)
where read_at is null;
