# MayerIG.com Squarespace → Justin CRM Form Bridge

## What this build adds
- Secure webhook endpoint: `POST https://crm.mayerig.com/api/website-leads`
- Justin-only CRM page: `/website-leads`
- New-submission badge in Justin's navigation
- New-submission alert on Justin's dashboard
- Click any submission to open the full Name, Phone, Email, Coverage Interest, and Message
- Opening a submission marks it read and clears the unread badge count
- Isaiah and Sheena cannot see the website-submission route or rows because the database rows are assigned to Justin and protected by RLS

## Required Vercel server environment variables
Do not put these values in source code.

- `SUPABASE_SECRET_KEY` — Supabase server secret key (`sb_secret_...`). `SUPABASE_SERVICE_ROLE_KEY` also works as a temporary legacy fallback.
- `WEBSITE_FORM_INGEST_SECRET` — a long random secret shared only between the CRM webhook and the Zapier webhook action.

## Squarespace / Zapier connection
Keep the native Squarespace Form Block with these fields:
- Name
- Phone
- Email
- Coverage Interest
- Message

Use Squarespace's Zapier form-submission integration as the trigger. The Zapier action should POST JSON to:

`https://crm.mayerig.com/api/website-leads`

Add this HTTP header:

`x-form-bridge-secret: <same value as WEBSITE_FORM_INGEST_SECRET>`

Recommended JSON body keys:
- `Name`
- `Phone`
- `Email`
- `Coverage Interest`
- `Message`

The endpoint also accepts common variations such as `first_name`, `last_name`, `phone number`, `email address`, `interests`, and `comments`.
