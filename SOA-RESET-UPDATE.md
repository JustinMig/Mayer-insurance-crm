# Dashboard Reset + CMS-aligned SOA Update

- Added Reset button to Height & Weight Underwriting Lookup.
- Reworked Scope of Appointment UI and generated signed file to include CMS-required content elements.
- Appointment date may be left blank initially, which saves a signed SOA draft.
- Draft SOAs can later be finalized from the client file list by selecting an appointment date; the CRM saves a finalized copy and keeps the original draft for history.
- All health-related product discussion categories are pre-selected by default: Medicare Advantage/Cost, stand-alone Part D, Medigap, Dental/Vision/Hearing, Hospital Indemnity, and other Medicare-related health products.
- Non-health products such as life insurance and annuities are intentionally not included in the Medicare SOA.
- No database migration is required for this update.
