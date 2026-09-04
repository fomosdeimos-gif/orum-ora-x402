do $$
begin
  if not exists (select 1 from vault.secrets where name = 'orum_hal_provider_hmac_v1') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'orum_hal_provider_hmac_v1',
      'HMAC credential for the isolated ORUM provider route offered to Hal Marketplace'
    );
  end if;
end
$$;

create or replace function public.orum_hal_provider_secret()
returns text
language sql
security definer
set search_path = vault, pg_temp
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'orum_hal_provider_hmac_v1'
  limit 1
$$;

revoke all on function public.orum_hal_provider_secret() from public, anon, authenticated;
grant execute on function public.orum_hal_provider_secret() to service_role, postgres;

comment on function public.orum_hal_provider_secret() is
  'Server-only retrieval of the Hal provider HMAC credential; never exposed to clients.';
