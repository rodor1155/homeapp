-- The filing category a document was uploaded into (the property hub buckets).
-- Nullable: rows filed before this existed keep falling back to the keyword
-- guess in lib/categories.ts.

alter table public.documents
  add column if not exists category text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.documents'::regclass
       and conname = 'documents_category_check'
  ) then
    alter table public.documents
      add constraint documents_category_check
      check (category is null or category in (
        'Insurance',
        'Utilities & bills',
        'Vehicle',
        'Property & compliance',
        'Warranties & appliances',
        'Subscriptions & services',
        'Other'
      ));
  end if;
end $$;

-- The dashboard and the documents list both read a household's rows by
-- category, so the filter is worth an index.
create index if not exists documents_household_category_idx
  on public.documents(household_id, category);
