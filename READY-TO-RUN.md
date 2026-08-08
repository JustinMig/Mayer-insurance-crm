# Mayer Insurance Group CRM — Editable Client Version

This package is already connected to the existing Supabase project. Do **not** rerun the SQL schema.

## What changed

- Open any client from Clients search and edit the full client record.
- Edit name, DOB, gender, email, phone, address, county, license dates/state, products, notes, and Medicare/Medicaid dates and levels.
- Admin/manager users can reassign the client to another active agent.
- Sensitive identifiers stay encrypted. Leave a sensitive field blank to keep the saved value, enter a new value to replace it, or use the clear checkbox to remove it.
- Every save writes a client.updated audit entry.

## Start it on Windows

1. Open this folder in File Explorer.
2. Click the address bar, type `cmd`, and press Enter.
3. Run `npm install` the first time you use this folder.
4. Run `npm run dev`.
5. Open http://localhost:3000 in your browser.

Keep the Command Prompt window open while testing locally.

## New: reveal encrypted identifiers
On a client profile, SSN, driver license number, Medicare number, and Medicaid number now have a **Show** button. They remain hidden by default. Click **Show** to view the saved value and **Hide** when finished. Each successful reveal is recorded in the audit log.


### Medicare files + signatures
The connected Supabase database has already been configured with the private `client-documents` bucket. No SQL setup is required for this version. Open a Medicare client and use **Upload File**, **Take Photo**, or **Sign Scope of Appointment** under Medicare Information.

## Agent filtering
Admin and Manager accounts now have an Agent dropdown on the Clients page. They can view All agents or select an individual agent. Search results also show the assigned agent. Agent accounts do not see this filter and remain limited by RLS to their own clients.

## Agent assignment on Add Client

- Admin and Manager/Assistant users now see **Assign client to agent** at the top of Add Client.
- Sheena must select an active agent before saving a new client.
- A client assigned to Isaiah appears in Isaiah's client list when he logs in.
- A client assigned to Justin appears in Justin's client list.
- Agent users do not get the assignment dropdown; their new clients are automatically assigned to themselves.
- Manager/Assistant accounts are intentionally excluded from the client-owner dropdown so clients are not accidentally assigned to the assistant.

## Add Client Medicare intake files
The Add Client > Medicare Information section now includes:
- Upload File
- Take Photo
- Card Information
- Sign Scope of Appointment

Files and the signed SOA are staged until Save Client is pressed. After the client is created, the staged items are automatically uploaded to that client's private Supabase Storage folder. Card Information is also available from an existing client's Medicare Information section.


## Doctors & Medications update

The connected Supabase project has already been migrated for this feature. No additional SQL setup is required. Add Client and client profiles now include Primary Doctor, 5 Specialists, Pharmacy, an unlimited medication list, and Medications file/photo upload. Uploading this version to the existing GitHub repository will trigger Vercel to redeploy automatically.
