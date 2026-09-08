-- Database webhook: on a new documents row with extraction_status = 'pending',
-- POST to the Next.js extraction route. URL + shared secret come from Vault
-- (names below); set them with vault.create_secret outside version control:
--
--   select vault.create_secret('https://<host>/api/extraction', 'extraction_webhook_url');
--   select vault.create_secret('<random-secret>',              'extraction_webhook_secret');
--
-- The same secret goes in the app env as EXTRACTION_WEBHOOK_SECRET.

create extension if not exists pg_net;

create or replace function private.notify_extraction_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _url text;
  _secret text;
begin
  if new.extraction_status is distinct from 'pending' then
    return new;
  end if;

  begin
    select decrypted_secret into _url
      from vault.decrypted_secrets where name = 'extraction_webhook_url';
    select decrypted_secret into _secret
      from vault.decrypted_secrets where name = 'extraction_webhook_secret';
  exception when others then
    _url := null;
    _secret := null;
  end;

  if _url is null or _secret is null then
    raise warning 'notify_extraction_webhook: vault secrets not set; skipping webhook for document %', new.id;
    return new;
  end if;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', _secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'documents',
      'record', jsonb_build_object(
        'id', new.id,
        'household_id', new.household_id,
        'property_id', new.property_id,
        'storage_path', new.storage_path,
        'extraction_status', new.extraction_status
      )
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

revoke all on function private.notify_extraction_webhook() from public, anon, authenticated;

drop trigger if exists documents_extraction_webhook on public.documents;
create trigger documents_extraction_webhook
  after insert on public.documents
  for each row execute function private.notify_extraction_webhook();
