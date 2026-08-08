-- Applied to Supabase production by migration: allow_authorized_client_document_deletion
-- Lets any authenticated CRM user delete files only for client records they are authorized to access.

drop policy if exists "authorized users delete documents" on public.documents;
create policy "authorized users delete documents"
on public.documents
for delete
to authenticated
using (
  agency_id = (select private.current_agency_id())
  and exists (select 1 from public.clients c where c.id = documents.client_id)
);

drop policy if exists "crm managers delete client documents" on storage.objects;
create policy "crm users delete client documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = ((select private.current_agency_id()))::text
  and exists (
    select 1 from public.clients c
    where c.id::text = (storage.foldername(objects.name))[2]
  )
);
