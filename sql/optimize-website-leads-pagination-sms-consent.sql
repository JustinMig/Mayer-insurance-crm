-- Website lead optimization + SMS consent audit trail
-- Safe to run repeatedly.

alter table public.website_leads
  add column if not exists sms_consent boolean not null default false,
  add column if not exists sms_consent_at timestamptz,
  add column if not exists sms_consent_source text,
  add column if not exists sms_consent_text text;

create index if not exists website_leads_agency_id_idx
  on public.website_leads (agency_id);

create index if not exists website_leads_converted_client_id_idx
  on public.website_leads (converted_client_id);

comment on column public.website_leads.sms_consent is
  'Affirmative SMS/text opt-in captured with the website form submission.';
comment on column public.website_leads.sms_consent_at is
  'Server timestamp when affirmative SMS/text opt-in was received.';
comment on column public.website_leads.sms_consent_source is
  'Source/path where affirmative SMS/text opt-in was captured.';
comment on column public.website_leads.sms_consent_text is
  'Disclosure text associated with the affirmative SMS/text opt-in.';
