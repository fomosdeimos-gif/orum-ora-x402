create or replace function public.orum_oro_attestor_keys()
returns table(seed_hex text)
language sql
security definer
set search_path = pg_catalog, public, vault, extensions
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'orum_oro_attestor_ed25519_seed'
  limit 1
$$;

revoke all on function public.orum_oro_attestor_keys() from public, anon, authenticated;
grant execute on function public.orum_oro_attestor_keys() to service_role, postgres;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'orum_oro_attestor_ed25519_seed'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'orum_oro_attestor_ed25519_seed',
      'Dedicated Ed25519 seed for ORUM operational certificate attestation; not an ORO-holder key'
    );
  end if;
end
$$;
