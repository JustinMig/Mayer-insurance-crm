# Multi-CSV Client Import Update

- Import screen now accepts multiple CSV files at once by file picker or drag/drop.
- Automatically identifies the main MayerInsuranceGroup client export using its FirstName/LastName columns.
- Related Cognito CSV exports are recognized and matched to clients by MayerInsuranceGroup_Id.
- Only fields that exist on the current CRM client intake form are transported to the import API and imported.
- Legacy-only fields are ignored instead of being copied into Notes or unrelated fields.
- Attachment metadata CSVs are accepted and matched, but metadata alone cannot recreate the original PDF/image file because the exported CSV does not contain the file bytes.
- CVV and Medicare.gov login/registration credentials are never transported to or stored by the CRM.
- Existing duplicate checks and RLS-based access control remain in place.
- No database schema migration is required for this update.
