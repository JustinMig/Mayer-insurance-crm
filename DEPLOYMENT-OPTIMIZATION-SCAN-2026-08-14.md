# Deployment / Optimization Scan — 2026-08-14

## Vercel
- Latest production build was READY.
- Next.js 16.3.0 / Turbopack.
- Production compile completed in ~1.2s; full build output completed in ~8s.
- No warning/error/fatal runtime logs were found on the current deployment during the checked hour.
- One historical website-lead credential error was recorded on an older deployment during the prior 24 hours.

## Important cleanup finding
The live Vercel route manifest still contained:
- `/clients/import`
- `/api/clients/import`
- `/api/clients/import/cognito-files`

This happened because manual GitHub ZIP uploads do not remove files that are absent from a newer ZIP.

This release overwrites those lingering GitHub paths with inert retirement stubs:
- `/clients/import` redirects to `/clients/document-import`
- old import APIs return HTTP 410
- old importer helper modules are inert
- original Cognito importer remains preserved in `feature-archive/cognito-client-import-backup.zip`

## Performance review
- Document OCR/PDF libraries are loaded only on the document-import screen from external CDN sources, not as npm dependencies in the main CRM bundle.
- Client and dashboard count queries already use parallel Promise.all calls.
- Sensitive/document API responses use private/no-store caching.
- Medical qualification API has short private caching.
- No TODO/FIXME markers were found in application source.
- Large static qualification/company datasets are the main source-code payload; their current use is acceptable because the medical data is served through an API rather than all being pushed to the browser.

## Supabase performance advisor
Only INFO-level unused-index notices were returned. No critical performance advisor findings were reported.
Do not remove indexes solely because they are currently unused; several protect future search/filter paths.

## Security advisor
Supabase reports leaked-password protection disabled. This is a security hardening item, not a speed issue.
