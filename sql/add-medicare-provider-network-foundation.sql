-- Foundation for verified Medicare Advantage doctor-to-plan network filtering.
-- Do NOT populate this table from the general Medicare Care Compare clinician list alone;
-- that list confirms Medicare participation, not a specific Medicare Advantage network.

create table if not exists public.medicare_network_providers (
  id uuid primary key default gen_random_uuid(),
  carrier text not null,
  npi text,
  practitioner_id text,
  full_name text not null,
  specialty text,
  organization_name text,
  address_line1 text,
  city text,
  state text not null default 'MS',
  zip_code text,
  phone text,
  accepting_new_patients boolean,
  source_url text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medicare_provider_plan_networks (
  id bigint generated always as identity primary key,
  provider_id uuid not null references public.medicare_network_providers(id) on delete cascade,
  medicare_plan_id uuid not null references public.medicare_plans(id) on delete cascade,
  network_id text,
  in_network boolean not null default true,
  source_url text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider_id, medicare_plan_id, network_id)
);

create index if not exists medicare_network_providers_name_idx on public.medicare_network_providers using gin (to_tsvector('simple', full_name));
create index if not exists medicare_network_providers_npi_idx on public.medicare_network_providers(npi);
create index if not exists medicare_network_providers_location_idx on public.medicare_network_providers(state, city, zip_code);
create index if not exists medicare_provider_plan_networks_provider_idx on public.medicare_provider_plan_networks(provider_id);
create index if not exists medicare_provider_plan_networks_plan_idx on public.medicare_provider_plan_networks(medicare_plan_id);

alter table public.medicare_network_providers enable row level security;
alter table public.medicare_provider_plan_networks enable row level security;

-- Reference-only data for signed-in CRM users.
drop policy if exists "Authenticated users can read Medicare network providers" on public.medicare_network_providers;
create policy "Authenticated users can read Medicare network providers"
on public.medicare_network_providers for select to authenticated using (true);

drop policy if exists "Authenticated users can read Medicare provider plan networks" on public.medicare_provider_plan_networks;
create policy "Authenticated users can read Medicare provider plan networks"
on public.medicare_provider_plan_networks for select to authenticated using (true);
