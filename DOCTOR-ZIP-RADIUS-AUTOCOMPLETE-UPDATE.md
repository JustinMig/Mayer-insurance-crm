# Doctor ZIP / Radius / Autocomplete Update

Added to the Medicare Plan Finder doctor section:

- 5-digit ZIP code field
- Radius choices: 5, 10, 25, 50, 100 miles
- Live doctor autocomplete after 2 typed characters
- Searches both first-name and last-name prefixes
- Results restricted to Mississippi and filtered to the selected radius
- Result rows show provider name, credentials, specialty, city/ZIP, NPI, and approximate distance
- Up to 5 doctors can be selected
- CMS NPPES NPI Registry API 2.1 is used for public provider names and practice-location data
- ZIP centroid coordinates are used to calculate approximate radius distance

Important: provider presence in NPPES does not prove in-network participation in a specific Medicare Advantage plan. The existing carrier-network filter remains intentionally inactive until verified carrier provider-plan network records are loaded.
