-- Private bucket for uploaded documents.
-- Path convention: <household_id>/<document_id>/<filename>

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Access is gated on the first path segment (household_id). The regex guard
-- keeps a malformed key from raising on the uuid cast.

create policy "documents_bucket_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );

create policy "documents_bucket_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );

create policy "documents_bucket_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );

create policy "documents_bucket_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );
