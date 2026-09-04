create or replace function public.orum_hal_provider_secret()
returns text
language sql
security definer
set search_path = vault, pg_temp
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'orum_hal_signing_secret'
  order by created_at desc
  limit 1
$$;

create or replace function public.orum_hal_provider_key()
returns text
language sql
security definer
set search_path = vault, pg_temp
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'orum_hal_provider_key'
  order by created_at desc
  limit 1
$$;

revoke all on function public.orum_hal_provider_key() from public, anon, authenticated;
grant execute on function public.orum_hal_provider_key() to service_role, postgres;
revoke all on function public.orum_hal_provider_secret() from public, anon, authenticated;
grant execute on function public.orum_hal_provider_secret() to service_role, postgres;
