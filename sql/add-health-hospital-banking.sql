-- Mayer Insurance Group CRM
-- Health Plan Info, Hospital Indemnity Plan, Banking Information,
-- plus Veteran and Smoking/Tobacco fields.
-- CVV is intentionally NOT stored.

alter table public.clients
  add column if not exists is_veteran boolean,
  add column if not exists is_smoker boolean;

create table if not exists public.client_health_plan_info (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null unique references public.clients(id) on delete cascade,
  company_name text,
  member_id_ciphertext text,
  plan_id text,
  effective_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_hospital_indemnity (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null unique references public.clients(id) on delete cascade,
  company_name text,
  premium_amount numeric(12,2),
  effective_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_banking_info (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null unique references public.clients(id) on delete cascade,
  bank_name text,
  routing_number_ciphertext text,
  account_number_ciphertext text,
  debit_card_number_ciphertext text,
  debit_card_expiration text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
