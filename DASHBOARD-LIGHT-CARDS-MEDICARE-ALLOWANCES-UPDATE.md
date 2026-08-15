# Dashboard light-card + Medicare allowance update

Updated 2026-08-14.

## Dashboard colors
- Company Contact Directory now has a light teal full-card background.
- Medicare Plan Finder now has a light green full-card background.
- Height / Weight Build Chart now has a light peach full-card background.
- Medical Qualifications now has a light lavender full-card background.
- Existing field-level colors remain, so the sections are easier to visually separate without using dark colors.

## Medicare Plan Finder
Plan results remain collapsed by default and Compare still supports up to 4 plans.

The expanded plan details keep:
- Monthly premium
- In-network maximum out-of-pocket
- PCP copay
- Specialist copay
- Inpatient hospital cost sharing

The supplemental section is simplified to exact dollar values only:
- Part B giveback (monthly)
- Dental annual allowance / maximum
- Vision annual allowance
- OTC amount + frequency/occurrence
- Food / nutrition amount + frequency/occurrence

Long dental, vision, hearing, OTC and food summary paragraphs are no longer shown in the normal plan card.

## Data accuracy behavior
- Dental annual amounts are safely extracted only from language that explicitly says annual/every year/maximum benefit.
- Vision allowance is shown only if an explicit annual allowance/max exists in the stored data.
- OTC and food benefits are shown only when an exact dollar amount and, when available, frequency are stored or explicitly present in the source text.
- Vague text such as `Some coverage` is intentionally not converted into a dollar amount.
- Part B giveback values are read from `benefit_details.part_b_credit_monthly`.

The production Supabase reference data was also updated with verified Part B giveback amounts for the confirmed plans. The SQL patch is included in `sql/medicare-part-b-credit-data-2026.sql` for reference/reproducibility.
