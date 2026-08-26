-- CRM Call List + permanent call history.
create table if not exists public.crm_call_list_items (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','answered','no_answer','voicemail','callback','not_interested')),
  callback_date date,
  callback_time time without time zone,
  last_outcome text check (last_outcome is null or last_outcome in ('answered','no_answer','voicemail','callback','not_interested')),
  last_note text,
  last_called_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.crm_call_attempts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  outcome text not null check (outcome in ('answered','no_answer','voicemail','callback','not_interested')),
  note text,
  callback_date date,
  callback_time time without time zone,
  calendar_event_id uuid references public.workspace_calendar_events(id) on delete set null,
  called_at timestamptz not null default now()
);

create index if not exists crm_call_list_user_status_idx on public.crm_call_list_items (user_id, status, added_at);
create index if not exists crm_call_list_agency_user_idx on public.crm_call_list_items (agency_id, user_id);
create index if not exists crm_call_list_client_idx on public.crm_call_list_items (client_id);
create index if not exists crm_call_attempts_client_called_idx on public.crm_call_attempts (client_id, called_at desc);
create index if not exists crm_call_attempts_user_called_idx on public.crm_call_attempts (user_id, called_at desc);
create index if not exists crm_call_attempts_agency_idx on public.crm_call_attempts (agency_id);
create index if not exists crm_call_attempts_calendar_event_idx on public.crm_call_attempts (calendar_event_id) where calendar_event_id is not null;

alter table public.crm_call_list_items enable row level security;
alter table public.crm_call_attempts enable row level security;
grant select, insert, update, delete on public.crm_call_list_items to authenticated;
grant select, insert, update, delete on public.crm_call_attempts to authenticated;

create policy "call list select" on public.crm_call_list_items for select to authenticated
using (agency_id = (select private.current_agency_id()) and ((select private.current_crm_role()) = 'manager' or user_id = (select auth.uid())));
create policy "call list insert" on public.crm_call_list_items for insert to authenticated
with check (agency_id = (select private.current_agency_id()) and (user_id = (select auth.uid()) or (select private.current_crm_role()) = 'manager') and exists (select 1 from public.clients c where c.id = crm_call_list_items.client_id and c.agency_id = (select private.current_agency_id()) and c.assigned_agent_id = crm_call_list_items.user_id));
create policy "call list update" on public.crm_call_list_items for update to authenticated
using (agency_id = (select private.current_agency_id()) and ((select private.current_crm_role()) = 'manager' or user_id = (select auth.uid())))
with check (agency_id = (select private.current_agency_id()) and ((select private.current_crm_role()) = 'manager' or user_id = (select auth.uid())) and exists (select 1 from public.clients c where c.id = crm_call_list_items.client_id and c.agency_id = (select private.current_agency_id()) and c.assigned_agent_id = crm_call_list_items.user_id));
create policy "call list delete" on public.crm_call_list_items for delete to authenticated
using (agency_id = (select private.current_agency_id()) and ((select private.current_crm_role()) = 'manager' or user_id = (select auth.uid())));

create policy "call attempts select" on public.crm_call_attempts for select to authenticated
using (agency_id = (select private.current_agency_id()) and ((select private.current_crm_role()) = 'manager' or user_id = (select auth.uid())));
create policy "call attempts insert" on public.crm_call_attempts for insert to authenticated
with check (agency_id = (select private.current_agency_id()) and (user_id = (select auth.uid()) or (select private.current_crm_role()) = 'manager') and exists (select 1 from public.clients c where c.id = crm_call_attempts.client_id and c.agency_id = (select private.current_agency_id()) and c.assigned_agent_id = crm_call_attempts.user_id));
create policy "call attempts update" on public.crm_call_attempts for update to authenticated
using (agency_id = (select private.current_agency_id()) and ((select private.current_crm_role()) = 'manager' or user_id = (select auth.uid())))
with check (agency_id = (select private.current_agency_id()) and ((select private.current_crm_role()) = 'manager' or user_id = (select auth.uid())));
create policy "call attempts delete" on public.crm_call_attempts for delete to authenticated
using (agency_id = (select private.current_agency_id()) and ((select private.current_crm_role()) = 'manager' or user_id = (select auth.uid())));

create trigger crm_call_list_items_set_updated_at before update on public.crm_call_list_items
for each row execute function public.set_updated_at();
