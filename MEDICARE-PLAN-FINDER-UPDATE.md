# Medicare Plan Finder update — 2026-08-14

Added a Dashboard Medicare Plan Finder for 2026 Mississippi MAPD plans from Aetna, Devoted, HealthSpring, Humana, and UnitedHealthcare.

## Search
- Type/select a Mississippi county.
- Select No Medicaid, QMB, SLMB, QI, FBDE/Full Medicaid, or Other Medicaid.
- No Medicaid removes D-SNP plans.
- If Medicaid is selected, D-SNPs are prioritized. When an exact plan-specific Medicaid category is not published in the master source, the UI requires eligibility verification rather than guessing.
- Results can be narrowed by carrier.

## Result details
Each plan card shows contract/PBP ID, plan type, SNP status, premium, in-network MOOP, PCP, specialist, inpatient hospital, OTC, food/nutrition, dental, vision, and hearing benefit summaries.

## Data
- County service area, plan identity, premium, and MOOP: CMS CY2026 Landscape 202608 (data updated 2026-08-10).
- Medical benefit summaries: 2026 Q1Medicare plan-benefit pages, which summarize Medicare/CMS plan data.
- If a public summary says only “Some coverage” and does not expose an OTC/food dollar allowance, the UI says to verify the carrier Summary of Benefits instead of displaying an invented amount.
