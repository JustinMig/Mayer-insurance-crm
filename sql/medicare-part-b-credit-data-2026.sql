-- Verified 2026 Part B monthly premium reductions for selected Mississippi MAPD plans.
-- These values are stored inside medicare_plans.benefit_details so no schema change is required.
-- Applied to the connected production Supabase project on 2026-08-14.

update public.medicare_plans
set benefit_details = coalesce(benefit_details, '{}'::jsonb) || jsonb_build_object(
  'part_b_credit_monthly', case
    when contract_id = 'H5521' and plan_id = '477' then '$60.00'
    when contract_id = 'H7355' and plan_id = '002' then '$164.40'
    when contract_id = 'H8768' and plan_id = '040' then '$55.00'
    when contract_id = 'H1036' and plan_id = '151' then '$1.00'
    when contract_id = 'H6622' and plan_id = '047' then '$1.00'
    when contract_id = 'H1889' and plan_id = '011' then '$0.90'
    when contract_id = 'H1889' and plan_id = '032' then '$0.70'
    when contract_id = 'H5008' and plan_id = '011' then '$0.50'
    when contract_id = 'H5008' and plan_id = '016' then '$1.30'
    when contract_id = 'H5008' and plan_id = '017' then '$0.30'
  end,
  'part_b_credit_verified', true,
  'part_b_credit_verified_date', '2026-08-14'
)
where (contract_id, plan_id) in (
  ('H5521','477'),('H7355','002'),('H8768','040'),('H1036','151'),('H6622','047'),
  ('H1889','011'),('H1889','032'),('H5008','011'),('H5008','016'),('H5008','017')
);
