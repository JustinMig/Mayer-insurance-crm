# Mayer Insurance Group CRM — Client CSV Import

## Added
- New **Import Clients** button on the Clients page for Admin and Manager users.
- New `/clients/import` workflow:
  1. Upload the main MayerInsuranceGroup CSV.
  2. Preview recognized clients before anything is saved.
  3. Select all valid clients or choose individual clients.
  4. Choose the agent to assign the imported clients to.
  5. Import in small batches with progress and results.
- Supports up to 10,000 CSV rows per file and previews 50 rows per page for responsive performance.
- Duplicate protection skips matches by email, phone, or first name + last name + DOB.
- Import audit entries are written for successfully created clients.

## Exact legacy field mapping
### Client Information
- FirstName / LastName
- DateOfBirthDOB2
- Gender
- Smoking
- Phone2
- Email
- Address2 / City / State / ZipCode / County2
- SSN2 (encrypted)
- DriversLicenseNumber2 (encrypted)
- ExpirationDate2 / StateIssued2
- MedicareClient / LifeInsuranceClient / RetirementInformation
- AreYouAVeteran
- NotesAppointmentsToDos

### Medicare
- MedicareNumberRedWhiteBlueCard (encrypted)
- PartAEffectiveDate
- PartBEffectiveDate
- MedicaidNumber (encrypted)
- Level

### Doctors / Pharmacy / Medications
- PCPDoctor / Cityd / Stated
- Up to 5 specialist doctor groups
- Pharmacy12, with Pharmacy22 preserved as a secondary-pharmacy note when needed
- MedicationsList2
- DoctorNotes

### Current Health Plan
- MedicareAdvantagePlan
- PlanID2
- MemberId2 (encrypted)
- NewEffectiveDate

### Hospital Indemnity
- HipPlanCompany2
- HipStartDate2
- HipPlanPrice2

### Banking
- BankName
- Routing (encrypted)
- AccountNumber (encrypted)
- DebitCardNumber (encrypted)
- DebitCardExpDate

### Life Insurance
- LifeCompany
- FaceAmount
- PremiumAmount
- PolicyType (Term / Whole Life / IUL)
- EffectiveDate
- PolicyNumber preserved in Notes because the current Life table has no policy-number column
- LifeInsuranceNotes preserved in Notes

### Other legacy information preserved in Notes
- Do-not-contact status
- SOA signed status
- Previous plan carrier / plan ID
- VA prescription status
- PDP information / carrier
- Supplement, Dental, Vision, Hearing and ACA text
- Retirement information

## Security exclusions
These values are intentionally **not imported** and are removed in the browser before any import request is sent to the CRM server:
- DebitCardCvv
- MedicaregovLoginInfo
- RegistrationInfoMedicaregov
- Previous-plan MemberId (no correct encrypted destination exists in the current CRM)

The server also ignores these fields if a request attempts to include them.

## Documents
This importer handles the main MayerInsuranceGroup client CSV. The separate PlanDocuments, SoA, PolicyDocuments, DentalFiles, etc. CSV exports are not imported by this workflow because those CSVs contain document metadata rather than the actual file bytes.
