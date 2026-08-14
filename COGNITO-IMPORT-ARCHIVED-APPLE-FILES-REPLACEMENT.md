# Cognito Import Archived / Apple Files Replacement

Changes:
- Removed the live `/clients/import` Cognito/CSV importer.
- Removed the live `/api/clients/import` routes, including direct Cognito file pulls.
- Removed the importer helper modules from the live TypeScript application.
- Replaced the Clients page `Import Clients` button with `IMPORT FROM FILES`, linking to `/clients/document-import`.
- Dashboard `IMPORT FROM FILES` remains unchanged.
- Archived the entire old importer in `feature-archive/cognito-client-import-backup.zip`.

Existing Supabase client and document data imported through Cognito is preserved and untouched.

The archive is not executable, not bundled, and not type-checked, so it has no runtime CRM performance impact.
