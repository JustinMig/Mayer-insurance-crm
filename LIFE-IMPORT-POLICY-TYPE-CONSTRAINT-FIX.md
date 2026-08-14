# Life Import Policy Type Constraint Fix

Fixed Supabase error:
`client_life_insurance_policy_type_check`

The database only permits:
- Term
- Whole Life
- IUL

Importer mapping:
- American-Amicable Senior Choice Immediate / Final Expense -> Whole Life
- Mutual/United of Omaha Indexed Universal Life Express -> IUL
- Term Life Express -> Term

A server-side normalization guard was also added so unsupported carrier product names can never be inserted into the constrained `policy_type` column.
