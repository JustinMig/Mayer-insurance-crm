alter table public.clients
  add column if not exists height_inches smallint,
  add column if not exists weight_lbs smallint;
