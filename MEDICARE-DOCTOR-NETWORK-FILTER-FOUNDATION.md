# Medicare Doctor Network Filter Foundation

This package adds the requested multi-doctor search area to the Medicare Plan Finder and prepares a Supabase schema for verified doctor-to-plan network data.

Important: the doctor entries intentionally do not filter plans until verified carrier provider-directory data is loaded. The CMS Care Compare clinician database identifies Medicare providers but does not prove participation in a specific Medicare Advantage plan network.

The target network sources are the carriers' CMS-required provider-directory APIs / machine-readable data for Aetna, Humana, Devoted, UnitedHealthcare, and HealthSpring. Once those records are synchronized into `medicare_network_providers` and `medicare_provider_plan_networks`, the finder can intersect multiple doctors and return only plans accepted by every selected doctor.
