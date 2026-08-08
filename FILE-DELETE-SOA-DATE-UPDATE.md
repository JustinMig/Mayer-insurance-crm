# File deletion + SOA signature-date update

- Added permanent Delete controls beside every saved client document section.
- Delete removes the private Supabase Storage object and the `documents` row and writes `document.deleted` to the audit log.
- Delete authorization follows existing client visibility: agents only on clients they can access; managers/admins on clients they can access.
- Removed the SOA draft/later appointment-date workflow.
- Scope of Appointment appointment date is now automatically the local date on which the beneficiary signs the SOA.
- All preselected Medicare/health-related product discussion categories remain prechecked.
