-- Role-aware dashboard rollup for Life Insurance premium reporting.
-- security_invoker keeps underlying clients / client_life_insurance RLS in force.
create or replace view public.life_premium_dashboard_rollup
with (security_invoker = true)
as
select
  c.agency_id,
  c.assigned_agent_id,
  extract(year from li.effective_date)::integer as effective_year,
  extract(month from li.effective_date)::integer as effective_month,
  count(*) filter (where coalesce(li.premium_amount, 0) <> 0)::bigint as policy_count,
  coalesce(sum(coalesce(li.premium_amount, 0)), 0)::numeric as premium_total
from public.client_life_insurance li
join public.clients c
  on c.id = li.client_id
 and c.agency_id = li.agency_id
group by
  c.agency_id,
  c.assigned_agent_id,
  extract(year from li.effective_date)::integer,
  extract(month from li.effective_date)::integer;

revoke all on public.life_premium_dashboard_rollup from anon;
grant select on public.life_premium_dashboard_rollup to authenticated;
