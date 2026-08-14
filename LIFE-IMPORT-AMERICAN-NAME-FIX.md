# American-Amicable Proposed Insured Name Fix

The American-Amicable importer no longer uses generic nearby-word name inference.

It now:
- Prioritizes the actual filled carrier row emitted as `Senior Choice Immediate INTERVIEW NOT REQ FIRST LAST`.
- Accepts a strict visible `Proposed Insured FIRST ... LAST` layout variant.
- Rejects form/prose words such as `The`, `Sum`, `Insurance`, `Proposed`, and `Insured`.
- Prevents the loose fallback parsers from running for American-Amicable.

This specifically prevents the incorrect `The / Sum` client name while preserving the rest of the working import fields.
