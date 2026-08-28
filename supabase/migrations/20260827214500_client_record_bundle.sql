create or replace function public.crm_client_record_bundle(p_client_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'client', to_jsonb(c),
    'medicare', (
      select to_jsonb(m)
      from public.medicare_info m
      where m.client_id = c.id
      limit 1
    ),
    'careInfo', (
      select to_jsonb(ci)
      from public.client_care_info ci
      where ci.client_id = c.id
      limit 1
    ),
    'specialists', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.slot)
      from public.client_specialists s
      where s.client_id = c.id
    ), '[]'::jsonb),
    'medications', coalesce((
      select jsonb_agg(to_jsonb(med) order by med.sort_order, med.created_at)
      from public.client_medications med
      where med.client_id = c.id
    ), '[]'::jsonb),
    'lifeInsurance', (
      select to_jsonb(li)
      from public.client_life_insurance li
      where li.client_id = c.id
      limit 1
    ),
    'healthPlan', (
      select to_jsonb(hp)
      from public.client_health_plan_info hp
      where hp.client_id = c.id
      limit 1
    ),
    'hospitalIndemnity', (
      select to_jsonb(hi)
      from public.client_hospital_indemnity hi
      where hi.client_id = c.id
      limit 1
    ),
    'banking', (
      select to_jsonb(b)
      from public.client_banking_info b
      where b.client_id = c.id
      limit 1
    ),
    'documents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'file_name', d.file_name,
          'mime_type', d.mime_type,
          'document_type', d.document_type,
          'created_at', d.created_at
        )
        order by d.created_at desc
      )
      from public.documents d
      where d.client_id = c.id
    ), '[]'::jsonb)
  )
  from public.clients c
  where c.id = p_client_id
  limit 1;
$$;

revoke all on function public.crm_client_record_bundle(uuid) from public;
revoke all on function public.crm_client_record_bundle(uuid) from anon;
grant execute on function public.crm_client_record_bundle(uuid) to authenticated;
