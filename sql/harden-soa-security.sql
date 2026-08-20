-- Applied to Supabase on 2026-08-19.
-- Keep trigger helper lookup paths fixed and expose SOA request reads only
-- through the same agency/client access boundary used by the CRM.

alter function public.prevent_signed_soa_request_changes()
  set search_path = pg_catalog, public;

alter function public.prevent_signed_soa_document_changes()
  set search_path = pg_catalog, public;

create policy "authorized users view soa signature requests"
on public.soa_signature_requests
for select
to authenticated
using (
  agency_id = (select private.current_agency_id())
  and exists (
    select 1
    from public.clients c
    where c.id = soa_signature_requests.client_id
  )
);
