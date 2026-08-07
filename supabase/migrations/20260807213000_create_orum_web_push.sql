create table if not exists public.ora_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  capability_hash text not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_test_at timestamptz,
  last_success_at timestamptz,
  last_error text
);

alter table public.ora_push_subscriptions enable row level security;
revoke all on public.ora_push_subscriptions from public, anon, authenticated;
grant select, insert, update on public.ora_push_subscriptions to service_role;

create table if not exists public.ora_push_log (
  id bigint generated always as identity primary key,
  subscription_id uuid references public.ora_push_subscriptions(id),
  kind text not null check (kind in ('teste','evento')),
  ok boolean not null,
  status_code integer,
  error text,
  sent_at timestamptz not null default now()
);

alter table public.ora_push_log enable row level security;
revoke all on public.ora_push_log from public, anon, authenticated;
grant select, insert on public.ora_push_log to service_role;

select vault.create_secret(
  encode(gen_random_bytes(32), 'base64'),
  'ORUM_PUSH_BOOTSTRAP',
  'Autentica apenas bootstrap e emissão interna do Web Push ORUM'
)
where not exists (select 1 from vault.secrets where name = 'ORUM_PUSH_BOOTSTRAP');

create or replace function public.orum_push_bootstrap_key()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'ORUM_PUSH_BOOTSTRAP'
  limit 1
$$;

create or replace function public.orum_push_vapid_store(p_public text, p_private text)
returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if exists (select 1 from vault.secrets where name in ('ORUM_PUSH_VAPID_PUBLIC','ORUM_PUSH_VAPID_PRIVATE')) then
    return false;
  end if;
  perform vault.create_secret(p_public, 'ORUM_PUSH_VAPID_PUBLIC', 'Chave pública VAPID Web Push ORUM');
  perform vault.create_secret(p_private, 'ORUM_PUSH_VAPID_PRIVATE', 'Chave privada VAPID Web Push ORUM');
  return true;
end;
$$;

create or replace function public.orum_push_vapid_get()
returns jsonb
language sql
security definer
set search_path = public, vault
as $$
  select jsonb_object_agg(
    case name when 'ORUM_PUSH_VAPID_PUBLIC' then 'public' else 'private' end,
    decrypted_secret
  )
  from vault.decrypted_secrets
  where name in ('ORUM_PUSH_VAPID_PUBLIC','ORUM_PUSH_VAPID_PRIVATE')
$$;

revoke all on function public.orum_push_bootstrap_key() from public, anon, authenticated;
revoke all on function public.orum_push_vapid_store(text,text) from public, anon, authenticated;
revoke all on function public.orum_push_vapid_get() from public, anon, authenticated;
grant execute on function public.orum_push_bootstrap_key() to service_role;
grant execute on function public.orum_push_vapid_store(text,text) to service_role;
grant execute on function public.orum_push_vapid_get() to service_role;

