# Existing Client Merge + Delete Client + Company Directory

## Existing client imports
- Matches existing clients by email, phone, or first/last name + DOB.
- Existing CRM values are never replaced by imported values.
- Only blank/missing intake fields are filled.
- Existing client assignment is preserved.
- Product flags can be added when the import indicates a product the CRM did not yet have marked.
- Medicaid Level is standardized to QMB / SLMB / QI / FBDE / Other. Equivalent legacy casing such as `qmb` may be standardized to `QMB` without changing its meaning.
- Medicare, doctors, specialists, medications, life, health plan, hospital indemnity, and banking sections are filled only where data is missing.
- Matching documents are uploaded for existing clients as well as new clients.
- A document with the same client + section + filename is skipped instead of duplicated.
- CVV and Medicare.gov credentials remain excluded.

## Delete client
- Admin and Manager users see a Delete Client button on the client profile.
- Deletion requires a confirmation prompt.
- Related database rows cascade-delete under the existing Supabase foreign keys.
- Private Storage files are cleaned up after the client row is deleted.
- The deletion is retained in audit history with the deleted client ID/name in audit details.

## Company Contact Directory
- Added to the Dashboard for all CRM users.
- Search by company, phone, fax, or email.
- Select a result to view Phone, Fax, Email, and Notes.
- Built from the provided Companies contact info export. The CSV and XLSX copies were verified as identical structured data; continuation rows were merged into the correct company.
- 302 named company records are included.
- The original source files are not required at runtime and are not included in this repository package.

## Database changes
- No new Supabase schema migration is required.
