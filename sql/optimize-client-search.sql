-- High-speed partial client search indexes for Mayer Insurance Group CRM.
-- This matches the Clients page ILIKE %term% search on first name, last name, phone and email.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create index if not exists clients_first_name_trgm_idx
  on public.clients using gin (first_name extensions.gin_trgm_ops);

create index if not exists clients_last_name_trgm_idx
  on public.clients using gin (last_name extensions.gin_trgm_ops);

create index if not exists clients_phone_trgm_idx
  on public.clients using gin (phone extensions.gin_trgm_ops);

create index if not exists clients_email_trgm_idx
  on public.clients using gin (email extensions.gin_trgm_ops);
