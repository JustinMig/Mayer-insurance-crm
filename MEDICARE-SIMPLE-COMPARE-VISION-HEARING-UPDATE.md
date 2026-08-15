# Medicare Plan Finder — Simple Compare + Vision/Hearing Update

## What changed

- Rebuilt each plan result into a fixed, easy-to-scan layout.
- Key costs are always first: Monthly Premium, Max Out-of-Pocket, and Part B Giveback.
- Medical section is always in the same order: Primary Care, Specialist, Hospital.
- Extra Benefits section is always in the same order: Dental, Vision, Hearing, OTC, Food.
- Vision is now extracted from the stored 2026 carrier/CMS benefit text into:
  - Eye exam
  - Eyewear / exact eyewear allowance when available
- Hearing is now extracted into:
  - Hearing exam
  - Hearing aids
- Existing exact dental, OTC, food, and Part B amounts remain in place.
- Only verified in-network selected doctors are shown on a plan.
- Added **Show differences only** to plan comparison.
- Raw dental/vision/hearing details and source notes were moved behind **More details** to reduce clutter.

## Data verification

The live `medicare_plans` table contains the expected text markers for all 64 plans:

- Routine eye exam: 64 / 64
- Eyeglasses: 64 / 64
- Hearing exam: 64 / 64
- Hearing aids: 64 / 64

No benefit dollar amount is invented. When an exact allowance is unavailable, the CRM displays the stored coverage/copay text.
