# Easiest Windows setup

> **Connected copy:** If this ZIP came from the August 8 connected setup, open `READY-TO-RUN.md` first. The Supabase database and first admin are already configured, so you should not repeat the database/bootstrap steps below.

You do not need Google Sites or Apps Script for this CRM.

## A. Accounts/software

1. Create a hosted Supabase project.
2. Install Node.js 20.9+ on the Windows computer.
3. Unzip this project into a normal folder such as `Documents\\Mayer-CRM`.

## B. Set up the database

1. In Supabase, open **SQL Editor**.
2. Copy all of `sql/schema.sql`, paste it into the editor, and click **Run**.
3. In Supabase, open **Authentication > Users** and create your CRM login.
4. Open `sql/bootstrap-admin.sql` on your computer.
5. Change `YOUR_EMAIL` to the exact email you just created.
6. Paste that SQL into Supabase SQL Editor and click **Run**.

## C. Connect this app to Supabase

1. Copy `.env.example` and rename the copy `.env.local`.
2. In Supabase's Connect/Project settings, copy the Project URL and publishable key into `.env.local`.
3. Open Command Prompt or PowerShell in the project folder and run:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

4. Copy the result after `DATA_ENCRYPTION_KEY_BASE64=` in `.env.local`.

## D. Start it

In PowerShell/Command Prompt inside the project folder:

```powershell
npm install
npm run dev
```

Then open `http://localhost:3000`.

## E. Make it accessible from every device

Localhost is only for development. To use the same CRM from your phone, tablet, and computer, deploy the project to a HTTPS-capable Next.js host and add the same environment variables to the host's secret/environment settings.

Once deployed, open that HTTPS address on the phone/tablet and choose **Add to Home Screen / Install app**.

## Before entering real regulated client information

Complete the production security/compliance setup first, including the appropriate agreements and high-compliance configuration with any provider that will handle regulated health information.
