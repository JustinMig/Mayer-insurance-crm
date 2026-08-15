# Doctor Office + Medicare Plan Network Update

## Added
- Preserves and displays every NPPES Mississippi practice location returned for a doctor inside the selected ZIP/radius.
- Each office is a separate autocomplete choice with street address, city, ZIP, NPI and distance.
- Selected doctor state now includes an exact `location_key` so two offices for the same NPI are not treated as the same selection.
- New authenticated API route: `POST /api/providers/network-status`.
- Medicare plan cards show each selected doctor and one of:
  - In network
  - Out of network
  - Not verified
- Added `ONLY PLANS ALL SELECTED DOCTORS TAKE` toggle.
- The filter only keeps plans where every selected doctor has a verified positive match at the selected office.

## Safety / accuracy rule
A missing provider-network record is **not** treated as out-of-network. It is shown as `Not verified` until a carrier directory import or sync explicitly verifies the NPI + office + plan relationship.

## Carrier network data
The API uses the reference tables defined in `sql/add-medicare-provider-network-foundation.sql`:
- `medicare_network_providers`
- `medicare_provider_plan_networks`

These tables must be populated from carrier provider-directory sources before plan filtering can return verified matches. NPPES alone is used only for doctor identity and office location and does not prove Medicare Advantage network participation.
