alter table dfm_public.ae_theses
  add column if not exists delivery_min_match_quality text not null default 'Moderate';

alter table dfm_public.ae_theses
  drop constraint if exists ae_theses_delivery_min_match_quality_check;

alter table dfm_public.ae_theses
  add constraint ae_theses_delivery_min_match_quality_check
  check (delivery_min_match_quality in ('Strong', 'Moderate'));

comment on column dfm_public.ae_theses.delivery_min_match_quality is
  'Minimum match quality that should create ClickUp delivery jobs for this AE. Default Moderate delivers Strong and Moderate; Strong delivers only Strong.';
