# Life Import Explicit Policy Save Fix

The document importer now explicitly writes the extracted life-insurance record after the client is created.

This prevents the Life Insurance section from being left blank even when the client and banking record save correctly.

Explicitly saved fields:
- company_name
- face_amount
- premium_amount
- policy_type
- effective_date

The server action validates the client's agency, normalizes money values, maps policy types to the database-allowed Term / Whole Life / IUL values, and keeps `clients.is_life` enabled.
