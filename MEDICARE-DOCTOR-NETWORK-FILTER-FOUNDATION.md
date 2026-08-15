# Medicare Doctor Network Filter

The original database foundation is now active as a verified-results cache.

The Medicare Plan Finder performs live provider-directory verification for connected carriers and saves verified doctor-office-to-plan results in:

- `medicare_network_providers`
- `medicare_provider_plan_networks`

Humana and Devoted have public live-directory adapters in this package. Aetna, HealthSpring, and UnitedHealthcare remain carrier-connection dependent and are shown as `Carrier source not connected` until their official Medicare Advantage directory connection is configured.

See `LIVE-MEDICARE-DOCTOR-NETWORK-VERIFICATION.md` for the full implementation and environment-variable list.
