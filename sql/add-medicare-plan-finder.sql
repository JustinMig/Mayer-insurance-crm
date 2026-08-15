-- 2026 Mississippi MAPD Plan Finder master tables.
-- Applied to the connected Mayer Insurance Group Supabase project on 2026-08-14.

create table if not exists public.medicare_plans (
  id uuid primary key default gen_random_uuid(),
  plan_year integer not null check (plan_year between 2020 and 2100),
  carrier text not null,
  parent_organization text,
  organization_name text,
  plan_name text not null,
  contract_id text not null,
  plan_id text not null,
  segment_id text not null default '0',
  plan_type text,
  snp_indicator boolean not null default false,
  snp_type text,
  dsnp_integration_status text,
  zero_dollar_cost_sharing_dsnp boolean,
  monthly_premium text,
  moop_in_network text,
  pcp_copay text,
  specialist_copay text,
  inpatient_hospital text,
  otc_benefit text,
  food_benefit text,
  dental_benefit text,
  vision_benefit text,
  hearing_benefit text,
  medicaid_levels text[] not null default '{}'::text[],
  medicaid_level_status text not null default 'not_required'
    check (medicaid_level_status in ('not_required','verified','needs_verification')),
  benefit_details jsonb not null default '{}'::jsonb,
  cms_source_date date,
  q1_source_url text,
  source_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_year, contract_id, plan_id, segment_id)
);

create table if not exists public.medicare_plan_counties (
  id bigint generated always as identity primary key,
  medicare_plan_id uuid not null references public.medicare_plans(id) on delete cascade,
  state text not null default 'MS',
  county_name text not null,
  county_fips text,
  created_at timestamptz not null default now(),
  unique (medicare_plan_id, state, county_name)
);

create index if not exists medicare_plans_carrier_idx
  on public.medicare_plans (plan_year, carrier, plan_name);
create index if not exists medicare_plans_contract_plan_idx
  on public.medicare_plans (contract_id, plan_id, segment_id);
create index if not exists medicare_plan_counties_lookup_idx
  on public.medicare_plan_counties (state, county_name, medicare_plan_id);

alter table public.medicare_plans enable row level security;
alter table public.medicare_plan_counties enable row level security;

drop policy if exists "authenticated users view medicare plans" on public.medicare_plans;
create policy "authenticated users view medicare plans" on public.medicare_plans
for select to authenticated using (true);

drop policy if exists "authenticated users view medicare plan counties" on public.medicare_plan_counties;
create policy "authenticated users view medicare plan counties" on public.medicare_plan_counties
for select to authenticated using (true);

revoke all privileges on table public.medicare_plans from anon, authenticated;
revoke all privileges on table public.medicare_plan_counties from anon, authenticated;
grant select on table public.medicare_plans to authenticated;
grant select on table public.medicare_plan_counties to authenticated;
