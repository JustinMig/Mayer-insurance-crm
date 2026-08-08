# Mayer Insurance Group CRM

This is the first working foundation for the Mayer Insurance Group CRM: one cloud CRM that can be used from a phone, tablet, or computer and installed as a PWA.

## Included in this build

- Secure email/password login using Supabase Auth
- Responsive desktop/tablet/mobile CRM shell
- Installable PWA manifest + service worker shell
- Dashboard counts
- Add Client form
- Client Information section
- Medicare Information section
- Doctors & Medications section with primary doctor, 5 specialists, pharmacy, unlimited medications, and medication photo/file uploads
- Medicare / Life / Retirement product selection
- Search clients by name, phone, or email
- Filter by Medicare, Life, or Retirement
- Turn 65 list
- Client profile screen
- Multi-agent-ready database schema
- Row Level Security (RLS)
- Admin / Manager / Agent roles
- Audit-log foundation
- Server-side AES-256-GCM encryption for SSN, driver license, Medicare number, and Medicaid number
- Document metadata table ready for the next phase

## Important security note

This code is a secure-oriented application foundation, but deploying software that stores regulated health/insurance information is not made compliant by code alone. Before storing real PHI/ePHI, configure the required legal and operational safeguards for your organization and hosting providers. For hosted Supabase projects handling PHI, Supabase's current documentation requires a signed BAA and the HIPAA add-on / High Compliance configuration.

## 1. Create Supabase

Create a new hosted Supabase project.

In Supabase > SQL Editor:

1. Run `sql/schema.sql`.
2. Go to Authentication > Users and create your first CRM login.
3. Open `sql/bootstrap-admin.sql`, replace `YOUR_EMAIL` with that login email, and run it.

For production, disable public user sign-up unless you intentionally build an invitation flow.

## 2. Create local environment settings

Copy `.env.example` to `.env.local`.

From Supabase Project Settings / Connect, paste your Project URL and publishable key:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Generate a 32-byte encryption key. With Node installed:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Put the result in `.env.local`:

```env
DATA_ENCRYPTION_KEY_BASE64=YOUR_GENERATED_KEY
```

**Do not lose or rotate this key casually.** It is required to decrypt sensitive identifiers already stored by the CRM. Store production secrets in your hosting provider's encrypted environment-variable/secret system; never commit `.env.local` to Git.

## 3. Run on your computer

Install Node.js 20.9 or newer, then from this project folder run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 4. Put it online

Deploy the Next.js project to a production host that supports Next.js server features and encrypted environment variables. Add the same 3 environment variables there.

The deployed site must use HTTPS for normal PWA installation and for protecting data in transit.

## 5. Install it on a phone/tablet

After it is deployed over HTTPS:

- iPhone/iPad: open in Safari > Share > Add to Home Screen.
- Android/Chrome: open the site > browser menu > Install app / Add to Home screen.
- Computer: modern Chromium browsers can also install the PWA from the address bar/menu when install criteria are met.

The icon opens the same CRM and the same database on every device.

## Current behavior

The Clients page intentionally does not load the entire database by default. Search or choose a product filter. The Turn 65 button returns clients whose 65th birthday falls in the current calendar year.

Sensitive identifiers are encrypted by a Next.js Server Action before the ciphertext is inserted into PostgreSQL. The profile page only displays the last 4 characters by default.

## Next build phase

Recommended next additions:

1. Edit every client field.
2. Upload/take a photo of Medicare cards and documents to a private storage bucket.
3. Scope of Appointment form + finger signature.
4. Agent management and assignment UI.
5. Tasks / follow-ups / reminders.
6. Policy records (carrier, plan, effective date, premium, status).
7. Full audit-history viewer.
8. MFA and stricter session controls.
9. Encrypted sensitive-field reveal workflow with audit logging.
10. Native-app packaging later if App Store / Play Store distribution is wanted.

## Sensitive-data reveal
Client profiles keep SSN, driver license number, Medicare number, and Medicaid number encrypted at rest. The profile shows only a masked value until an authorized user clicks **Show**. The full value is decrypted on the server only after the signed-in user's normal Row Level Security access succeeds. Each successful reveal is written to `audit_log` as `sensitive.revealed`, and reveal responses are sent with no-store/no-cache headers.


## Medicare client files and Scope of Appointment

The Medicare Information section now includes:

- **Upload File** for images, PDF, TXT, DOC, and DOCX files (maximum 10 MB).
- **Take Photo** for using a phone/tablet camera to capture Medicare cards or other documents.
- **Sign Scope of Appointment** for collecting an electronic signature with a finger, stylus, or mouse. The CRM creates a signed PNG record and saves it in the client's private files.
- **Open** buttons for previously stored client documents. Opening a document uses a short-lived signed Storage URL and creates an audit-log entry.

Client documents are stored in the private Supabase bucket `client-documents`; they are not public links. The connected Supabase project has already been migrated for this feature.

The CRM-generated Scope of Appointment captures product types, appointment date, beneficiary contact information, agent contact information, acknowledgment language, timestamp, and electronic signature. Confirm any carrier-specific wording, timing, and retention requirements before using it as your production compliance record.

### Agent ownership workflow
Admin and Manager users can assign new clients to an active agency sales owner (Admin or Agent) from the Add Client form. The server validates the selected owner against the agency before saving. Agent users are automatically assigned as owner of clients they create. Managers remain able to search/filter across all agents but are not offered as client owners.

### Intake document workflow
New-client intake can stage a Medicare document, camera photo, Card Information file, and electronically signed Scope of Appointment before the client record exists. Saving the client creates the database record first and then uploads those staged items through the authenticated client-document API.


## Doctors & Medications

Both Add Client and existing client profiles include a **Doctors & Medications** section. It stores the primary doctor, up to five specialist doctors, the client's pharmacy, and an expandable medication list with medication name, dosage, times per day, quantity filled, and number of refills. Medication lists/photos are stored in the existing private `client-documents` bucket using the `medications` document type.


## Life Insurance section

The Add Client and client profile pages include Life Insurance fields for company, face amount, premium amount, policy type, effective date, and a private life-insurance document upload. Company choices include American Amicable, Mutual of Omaha, CICA, Gerber, Corebridge, Transamerica, Aflac, plus a custom company option. Face amounts include $5,000 through $25,000 presets plus a custom amount.

## Add Client visual redesign

The Add Client page now starts every major section collapsed. Client Information, Medicare Information, Doctors & Medications, Life Insurance, and Notes each use a different colored header. Inside each section, related fields are separated into smaller cards for easier scanning on desktop, tablet, and phone.
