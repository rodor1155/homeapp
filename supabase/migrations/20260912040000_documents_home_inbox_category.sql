-- Allow filing under Home inbox (school letters, permission slips, etc.).

alter table public.documents
  drop constraint if exists documents_category_check;

alter table public.documents
  add constraint documents_category_check
  check (category is null or category in (
    'Insurance',
    'Utilities & bills',
    'Vehicle',
    'Property & compliance',
    'Warranties & appliances',
    'Subscriptions & services',
    'Home inbox',
    'Other'
  ));
