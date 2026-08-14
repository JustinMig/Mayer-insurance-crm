# Life Import Field Accuracy Update 3

Carrier-layout fixes based directly on the supplied PDFs.

American-Amicable:
- Reads first and last name directly from the top Proposed Insured row.
- Adds a fallback for the carrier text stream that emits `INTERVIEW NOT REQ FIRST LAST`.

Mutual / United of Omaha page 15:
- Reads bank name from `2. Name of Financial Institution: VALUE`.
- Reads routing/account from the same rendered row:
  `Bank Routing Number: VALUE  Bank Account Number: VALUE`.
- Reads Checking/Savings from the Account Type row.
- Reads the monthly draft day from the selected ongoing-payment row.
- Reads the life start/effective date from `Deduct initial premium on or after: MM/DD/YYYY`.

All other working life-import behavior is preserved.
