# Client Selection + Agent Client List Update

- Client results now include a checkbox on every row.
- Added **Select all on this page** for the current result set (up to 250 displayed clients).
- CSV/PDF export now exports only the clients explicitly selected on the current page.
- Existing export field selection remains, with First Name, Last Name, and Mailing Address selected by default.
- Export requests are still protected by Supabase RLS, so manually submitted unauthorized client IDs are excluded.
- Client list columns are now: Client Name, Agent, DOB, Phone, County, State, Products.
- Agent column is visible on agent portals as well as admin/manager portals.
- Client names are clickable and open the client profile.
- Removed the separate Open button from the end of each client row.
- No database migration or environment variable change is required.
