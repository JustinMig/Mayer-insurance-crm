# Client Filter, Export, and Agent Portal Update

This version adds:

- Client product filters for Life, Medicare, Retirement, Life + Medicare, Non-Life, and Non-Medicare.
- Client export to CSV or PDF from the Clients page.
- Export field selection with First Name, Last Name, and Mailing Address selected by default.
- Optional export fields for Phone, Email, Date of Birth, County, and Products.
- Sensitive identifiers and banking/card fields are intentionally excluded from exports.
- Exports respect the logged-in user's existing Supabase RLS permissions and current client filters.
- Export activity is written to the audit log.
- Manager accounts are excluded from agent-selection dropdowns, so Sheena remains a Manager but does not appear as an assignable/filterable agent.
- Agent portals display the logged-in agent's name beside the bear instead of Mayer Insurance Group. Admin/Manager branding remains Mayer Insurance Group.
- The bear continues to link to the Dashboard.

No new database tables or environment variables are required.
