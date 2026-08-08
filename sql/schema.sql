-- Mayer Insurance Group CRM - PostgreSQL/Supabase schema
-- Intended for a NEW project only. The connected Mayer Insurance Group project
-- is already provisioned; do not re-run this file there unless intentionally rebuilding.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  full_name text not null,
  role text not null default 'agent' check (role in ('admin','manager','agent')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  gender text,
  email text,
  phone text,
  address_line1 text,
  city text,
  state text,
  zip_code text,
  county text,
  ssn_ciphertext text,
  drivers_license_ciphertext text,
  drivers_license_state text,
  drivers_license_expiration date,
  is_medicare boolean not null default false,
  is_life boolean not null default false,
  is_retirement boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medicare_info (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null unique references public.clients(id) on delete cascade,
  medicare_number_ciphertext text,
  part_a_date date,
  part_b_date date,
  medicaid_number_ciphertext text,
  medicaid_level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  document_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_agency_idx on public.profiles (agency_id);
create index if not exists clients_agency_name_idx on public.clients (agency_id, last_name, first_name);
create index if not exists clients_agent_idx on public.clients (assigned_agent_id);
create index if not exists clients_dob_idx on public.clients (agency_id, date_of_birth);
create index if not exists clients_phone_idx on public.clients (agency_id, phone);
create index if not exists clients_email_idx on public.clients (agency_id, email);
create index if not exists medicare_client_idx on public.medicare_info (client_id);
create index if not exists medicare_agency_idx on public.medicare_info (agency_id);
create index if not exists documents_client_idx on public.documents (client_id);
create index if not exists documents_agency_idx on public.documents (agency_id);
create index if not exists documents_uploaded_by_idx on public.documents (uploaded_by);
create index if not exists audit_client_idx on public.audit_log (client_id, created_at desc);
create index if not exists audit_agency_idx on public.audit_log (agency_id);
create index if not exists audit_actor_idx on public.audit_log (actor_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists medicare_set_updated_at on public.medicare_info;
create trigger medicare_set_updated_at before update on public.medicare_info
for each row execute function public.set_updated_at();

-- RLS helper functions live in an unexposed schema.
create or replace function private.current_agency_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select agency_id from public.profiles where id = auth.uid() and active = true limit 1;
$$;

create or replace function private.current_crm_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true limit 1;
$$;

revoke all on schema private from public;
revoke execute on function private.current_agency_id() from public, anon;
revoke execute on function private.current_crm_role() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_agency_id() to authenticated;
grant execute on function private.current_crm_role() to authenticated;

alter table public.agencies enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.medicare_info enable row level security;
alter table public.documents enable row level security;
alter table public.audit_log enable row level security;

create policy "agency members can view their agency" on public.agencies
for select to authenticated
using (id = private.current_agency_id());

create policy "members can view agency profiles" on public.profiles
for select to authenticated
using (agency_id = private.current_agency_id());

create policy "users can update own profile" on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (
  id = (select auth.uid())
  and agency_id = private.current_agency_id()
  and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
  and active = (select p.active from public.profiles p where p.id = (select auth.uid()))
);

create policy "admins manage agency profiles" on public.profiles
for all to authenticated
using (agency_id = private.current_agency_id() and private.current_crm_role() in ('admin','manager'))
with check (agency_id = private.current_agency_id() and private.current_crm_role() in ('admin','manager'));

create policy "authorized users view clients" on public.clients
for select to authenticated
using (
  agency_id = private.current_agency_id()
  and (private.current_crm_role() in ('admin','manager') or assigned_agent_id = (select auth.uid()))
);

create policy "authorized users insert clients" on public.clients
for insert to authenticated
with check (
  agency_id = private.current_agency_id()
  and (assigned_agent_id = (select auth.uid()) or private.current_crm_role() in ('admin','manager'))
);

create policy "authorized users update clients" on public.clients
for update to authenticated
using (
  agency_id = private.current_agency_id()
  and (private.current_crm_role() in ('admin','manager') or assigned_agent_id = (select auth.uid()))
)
with check (
  agency_id = private.current_agency_id()
  and (private.current_crm_role() in ('admin','manager') or assigned_agent_id = (select auth.uid()))
);

create policy "admins delete clients" on public.clients
for delete to authenticated
using (agency_id = private.current_agency_id() and private.current_crm_role() in ('admin','manager'));

create policy "authorized users view medicare" on public.medicare_info
for select to authenticated
using (
  agency_id = private.current_agency_id()
  and exists (select 1 from public.clients c where c.id = client_id)
);

create policy "authorized users insert medicare" on public.medicare_info
for insert to authenticated
with check (
  agency_id = private.current_agency_id()
  and exists (select 1 from public.clients c where c.id = client_id)
);

create policy "authorized users update medicare" on public.medicare_info
for update to authenticated
using (
  agency_id = private.current_agency_id()
  and exists (select 1 from public.clients c where c.id = client_id)
)
with check (agency_id = private.current_agency_id());

create policy "admins delete medicare" on public.medicare_info
for delete to authenticated
using (agency_id = private.current_agency_id() and private.current_crm_role() in ('admin','manager'));

create policy "authorized users view documents" on public.documents
for select to authenticated
using (
  agency_id = private.current_agency_id()
  and exists (select 1 from public.clients c where c.id = client_id)
);

create policy "authorized users insert documents" on public.documents
for insert to authenticated
with check (
  agency_id = private.current_agency_id()
  and exists (select 1 from public.clients c where c.id = client_id)
);

create policy "authorized users write audit" on public.audit_log
for insert to authenticated
with check (agency_id = private.current_agency_id() and actor_id = (select auth.uid()));

create policy "managers view audit" on public.audit_log
for select to authenticated
using (agency_id = private.current_agency_id() and private.current_crm_role() in ('admin','manager'));

grant select on public.agencies to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.medicare_info to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert on public.audit_log to authenticated;
grant usage, select on sequence public.audit_log_id_seq to authenticated;

-- Private Storage bucket for client Medicare documents and signed Scope of Appointment files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-documents',
  'client-documents',
  false,
  10485760,
  array['image/jpeg','image/png','image/heic','image/heif','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "crm users upload client documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = private.current_agency_id()::text
  and exists (select 1 from public.clients c where c.id::text = (storage.foldername(name))[2])
);

create policy "crm users view client documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = private.current_agency_id()::text
  and exists (select 1 from public.clients c where c.id::text = (storage.foldername(name))[2])
);

create policy "crm managers delete client documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = private.current_agency_id()::text
  and exists (select 1 from public.clients c where c.id::text = (storage.foldername(name))[2])
  and private.current_crm_role() in ('admin','manager')
);

create policy "authorized users delete documents" on public.documents
for delete to authenticated
using (
  agency_id = private.current_agency_id()
  and exists (select 1 from public.clients c where c.id = client_id)
  and private.current_crm_role() in ('admin','manager')
);
