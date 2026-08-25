-- Compact RLS-aware views used to avoid downloading full client datasets
-- for dashboard totals and Client Records filter options.

create or replace view public.client_dashboard_rollup
with (security_invoker = true)
as
with central_clock as (
  select (now() at time zone 'America/Chicago')::date as today
)
select
  c.agency_id,
  c.assigned_agent_id,
  count(*)::bigint as total_clients,
  count(*) filter (where c.is_medicare is true)::bigint as medicare_clients,
  count(*) filter (where c.is_medicare is false)::bigint as non_medicare_clients,
  count(*) filter (where c.is_life is true)::bigint as life_clients,
  count(*) filter (
    where c.date_of_birth >= make_date(extract(year from central_clock.today)::integer - 65, 1, 1)
      and c.date_of_birth < make_date(extract(year from central_clock.today)::integer - 64, 1, 1)
  )::bigint as turning_65
from public.clients c
cross join central_clock
group by c.agency_id, c.assigned_agent_id;

comment on view public.client_dashboard_rollup is
  'RLS-aware compact client totals for the CRM dashboard and Client Records page.';

revoke all on public.client_dashboard_rollup from public;
revoke all on public.client_dashboard_rollup from anon;
grant select on public.client_dashboard_rollup to authenticated;
grant select on public.client_dashboard_rollup to service_role;

create or replace view public.health_plan_company_options
with (security_invoker = true)
as
select
  agency_id,
  btrim(company_name) as company_name
from public.client_health_plan_info
where nullif(btrim(company_name), '') is not null
group by agency_id, btrim(company_name);

comment on view public.health_plan_company_options is
  'RLS-aware distinct health-plan company options for Client Records filtering.';

revoke all on public.health_plan_company_options from public;
revoke all on public.health_plan_company_options from anon;
grant select on public.health_plan_company_options to authenticated;
grant select on public.health_plan_company_options to service_role;
