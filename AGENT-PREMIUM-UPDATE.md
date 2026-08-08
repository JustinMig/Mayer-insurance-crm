# Agent Premium Dashboard Update

- Admin and manager/assistant users see an all-agents total plus a separate Life Insurance premium card for every active admin/agent.
- Each agent sees only their own Life Insurance premium total and their own monthly breakdown.
- The database rollup view uses `security_invoker = true`, so existing RLS on `clients` and `client_life_insurance` remains in force.
- Per-agent cards also show the current month and current-year premium total.
- No service-role key is used by the dashboard.
