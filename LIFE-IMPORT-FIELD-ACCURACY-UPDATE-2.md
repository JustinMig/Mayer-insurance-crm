# Life Import Field Accuracy Update 2

This update tightens the life-insurance document importer against the supplied Mutual/United of Omaha and American-Amicable sample PDFs.

Fixes:
- Mutual/United driver's license number and state now read from the filled row under the Driver’s License headings, including curly-apostrophe PDF text.
- Mutual/United bank name, routing number, account number, checking/savings selection, and monthly draft day now use layout-aware Payment Authorization parsing.
- Mutual/United life effective/start date now uses the selected “Deduct initial premium on or after” date.
- American-Amicable proposed insured name now has safe fallbacks from the insured/bank authorization and receipt sections when PDF text coordinates separate the filled name from the Proposed Insured label.
- American-Amicable banking parsing remains anchored to its preauthorization/bank-draft form.
