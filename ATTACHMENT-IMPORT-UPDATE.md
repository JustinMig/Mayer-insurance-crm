# Attachment Import Update

This build expands the Mayer Insurance Group legacy import workflow.

## Medicaid Level

The old CSV field `Level` maps directly to the CRM `Medicaid Level` field.
Values are normalized to the current dropdown values:
- QMB
- SLMB
- QI
- FBDE
- Other

This prevents old lowercase values such as `qmb` from appearing blank in the CRM dropdown.

## Multi-file attachment import

The import screen now accepts:
- the Mayer Insurance Group CSV export files
- actual PDF/image/TXT/DOC/DOCX files from the legacy system

Attachment CSV rows are matched to clients by `MayerInsuranceGroup_Id` and then matched to actual files using the legacy file name / file ID. Cognito-style bulk file names such as `16_1_Uhc 2026.pdf` are supported.

### Legacy attachment CSV mappings

- SoA2 -> Medicare Information / Scope of Appointment
- CardInformation2 -> Medicare Information / Card Information
- PDPExtra -> Medicare Information
- PDPPlanInfo2 -> Medicare Information
- SupplementPlanInfo -> Medicare Information
- PlanDocuments -> Health Plan Info
- PlanExtraDocuments -> Health Plan Info
- PlanExtraDocuments2 -> Health Plan Info
- MedicationsPhotos -> Doctors & Medications
- PolicyDocuments -> Life Insurance
- HipPlanDocument2 -> Hospital Indemnity Plan
- ACAFiles -> Other Coverage Files / ACA
- DentalFiles2 -> Other Coverage Files / Dental
- HearingFiles -> Other Coverage Files / Hearing
- VisionFiles -> Other Coverage Files / Vision
- RetirementFiles -> Other Coverage Files / Retirement

The client profile now includes a Hospital Indemnity file panel and an Other Coverage Files panel for imported ACA, dental, hearing, vision, and retirement files.

## Safety

- Actual attachment bytes must be present in the selected files. Metadata-only CSV rows cannot recreate a PDF/image by themselves.
- Missing or ambiguous attachment matches are shown before import.
- Unsupported client data columns are not copied into Notes.
- CVV and Medicare.gov credentials remain excluded.
- Existing RLS/private storage behavior is unchanged.
