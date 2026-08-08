# Mayer Insurance Group CRM — Health, Hospital & Banking Update

Added:
- Health Plan Info section with company dropdown, Other company, encrypted Member ID, Plan ID, effective date, and private file upload.
- Hospital Indemnity Plan section with company, premium, and effective date.
- Banking Information section with bank name, encrypted routing/account/debit-card numbers, debit-card expiration, and an explicit CVV-not-stored notice.
- Veteran and Smoking / tobacco-use Yes/No fields in Client Information.
- Saved client profiles now use the same color-coded section design as Add Client and all sections start collapsed.
- Sensitive reveals for health-plan Member ID and banking numbers are audit logged.

Supabase production schema has already been updated. The SQL file is retained under sql/ for project history.
