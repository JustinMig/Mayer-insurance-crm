# Height / Weight Build Chart Update

This update adds:

- Dashboard **Height & Weight Underwriting Lookup**.
- Company aliases:
  - `MOO` -> Mutual of Omaha
  - `AMAM` -> American Amicable
- Mutual of Omaha values are from **Moo info.pdf page 28 only**.
  - Includes TLE/IULE/Living Promise minimum weight.
  - Includes TLE/IULE maximum weight.
  - Intentionally excludes DI Rider Maximum Weight.
- American Amicable values are from **AmAm Senior 50-85.pdf page 13 only** (printed page 14).
  - Shows Maximum Weight for Plan: Immediate, Graded, ROP.
  - Shows Minimum Weight for Plan: Immediate, ROP.
  - Preserves the source chart values exactly as printed.
- Client Information now includes:
  - Height - feet
  - Height - inches
  - Weight (lb)
- Height is stored as total inches in `clients.height_inches`.
- Weight is stored in `clients.weight_lbs`.

Supabase migration applied:

`add_client_height_weight`

The `clients` table remains protected by RLS.
