# Live Medicare Doctor Network Verification — 2026

This update replaces the original cache-only doctor/network foundation with live carrier-directory verification.

## What happens now

1. Doctor identity and office choices come from CMS NPPES.
2. When a doctor office and Medicare plans are selected, `/api/providers/network-status` checks the carrier provider directory.
3. Verification uses the doctor NPI + exact selected office + exact CMS contract/plan/segment/year.
4. The carrier InsurancePlan network is compared with PractitionerRole network membership at the selected Location.
5. Verified in-network and out-of-network results are saved to Supabase and reused for 7 days.
6. The "ONLY PLANS ALL SELECTED DOCTORS TAKE" filter keeps only plans where every selected doctor office is verified in-network.

## Carrier status

### Connected without credentials
- Humana — `https://fhir.humana.com/api`
- Devoted — `https://fhir.devoted.com/fhir`

### Adapter prepared; carrier connection/credentials still required
- Aetna
- HealthSpring
- UnitedHealthcare

The CRM deliberately returns `source_unavailable` for an unconnected carrier. It does not infer Medicare Advantage network participation from NPPES or general Medicare participation.

## Optional environment variables for additional carriers

### Aetna
- `AETNA_PROVIDER_DIRECTORY_BASE_URL`
- `AETNA_PROVIDER_DIRECTORY_BEARER_TOKEN` (only if the registered carrier connection provides a bearer token compatible with the endpoint)

### HealthSpring
- `HEALTHSPRING_PROVIDER_DIRECTORY_BASE_URL`
- `HEALTHSPRING_PROVIDER_DIRECTORY_BEARER_TOKEN` (when applicable)

### UnitedHealthcare
- `UHC_PROVIDER_DIRECTORY_BASE_URL`
- `UHC_PROVIDER_DIRECTORY_BEARER_TOKEN` (when applicable)

If a carrier uses OAuth client credentials or another token exchange rather than a static bearer token, its authentication adapter must be completed with the credentials issued for the registered application.

## Performance protections

- Carrier FHIR responses: 6-hour Next.js cache.
- Parsed plan, practitioner, role, and location lookups: in-process 6-hour memoization.
- Supabase verified network cache: 7 days.
- Live network checks are concurrency-limited to 6 operations at a time.
- Repeated doctors/plans share the same live lookup instead of generating duplicate carrier calls.
- Network verification route allows up to 60 seconds for a cold carrier lookup, while warm cached results are normally much faster.

## Accuracy protections

- Fuzzy plan-name matches are never treated as verified network membership.
- The exact CMS plan identifier must be located in the carrier InsurancePlan resource.
- Both InsurancePlan-level and plan-level network references are supported.
- Exact selected office location is required before a provider can be marked in-network.
- Unavailable or incomplete carrier data stays unverified rather than being guessed.
