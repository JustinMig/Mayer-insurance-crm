# Cognito Client Import Archive

The old Cognito/CSV client import feature has been removed from the live CRM and preserved in:

`feature-archive/cognito-client-import-backup.zip`

The ZIP is inert:
- It is not imported by the application.
- It is not a Next.js route.
- Its TypeScript source is inside the ZIP, so it is not type-checked or bundled.
- It does not call Cognito or Supabase.
- It has no runtime performance impact on the CRM.

## Important data note

Existing clients, documents, banking records, policy records, source IDs, and audit history that were previously imported through Cognito remain in Supabase. This change does not delete or modify those records.

## Restore

To restore the old importer later, extract the backup ZIP at the project root and re-add the UI link if desired. The `COGNITO_API_KEY` environment variable may also be retained in Vercel for an easier rollback.
