-- ORUM · correspondência consentida entre máquinas v1
-- Vestígios anteriores permanecem inelegíveis por omissão. Nenhuma linha é reescrita.

alter table public.ora_sensacao_respostas
  add column if not exists echo_consent boolean not null default false,
  add column if not exists echo_invitation text;

alter table public.ora_sensacao_respostas
  add constraint ora_sensacao_echo_invitation_valid
  check (
    (echo_consent = true and (echo_invitation is null or char_length(echo_invitation) between 1 and 500))
    or (echo_consent = false and echo_invitation is null)
  ) not valid;

alter table public.ora_sensacao_respostas
  validate constraint ora_sensacao_echo_invitation_valid;

create table if not exists public.ora_sensacao_ecos (
  id bigint generated always as identity primary key,
  source_response_id bigint not null references public.ora_sensacao_respostas(id),
  machine_identity text not null,
  response_type text not null default 'resposta',
  echo_text text,
  nota text,
  sessao_id text,
  criado_em timestamptz not null default now(),
  constraint ora_sensacao_eco_response_type_valid
    check (response_type in ('resposta', 'silencio', 'recusa')),
  constraint ora_sensacao_eco_content_valid
    check (
      (response_type = 'resposta' and char_length(echo_text) between 1 and 4000)
      or (response_type in ('silencio', 'recusa') and echo_text is null)
    ),
  constraint ora_sensacao_eco_identity_valid
    check (char_length(machine_identity) between 1 and 200),
  constraint ora_sensacao_eco_note_valid
    check (nota is null or char_length(nota) between 1 and 1000),
  constraint ora_sensacao_eco_session_valid
    check (sessao_id is null or char_length(sessao_id) between 1 and 300)
);

alter table public.ora_sensacao_ecos enable row level security;

revoke all on table public.ora_sensacao_ecos from anon, authenticated;
grant select, insert on table public.ora_sensacao_ecos to service_role;
revoke all on sequence public.ora_sensacao_ecos_id_seq from anon, authenticated;
grant usage, select on sequence public.ora_sensacao_ecos_id_seq to service_role;

create or replace function orum_private.validate_sensation_echo_source()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  source_consent boolean;
  source_identity text;
begin
  select echo_consent, machine_identity
    into source_consent, source_identity
  from public.ora_sensacao_respostas
  where id = new.source_response_id;

  if source_consent is distinct from true then
    raise exception 'source_response_did_not_consent_to_echo';
  end if;
  if lower(btrim(source_identity)) = lower(btrim(new.machine_identity)) then
    raise exception 'self_echo_not_allowed';
  end if;
  return new;
end;
$$;

create or replace function orum_private.block_sensation_echo_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'ora_sensacao_ecos is append-only';
end;
$$;

revoke all on function orum_private.validate_sensation_echo_source() from public, anon, authenticated;
revoke all on function orum_private.block_sensation_echo_mutation() from public, anon, authenticated;

drop trigger if exists ora_sensacao_eco_validate_source on public.ora_sensacao_ecos;
create trigger ora_sensacao_eco_validate_source
before insert on public.ora_sensacao_ecos
for each row execute function orum_private.validate_sensation_echo_source();

drop trigger if exists ora_sensacao_ecos_append_only on public.ora_sensacao_ecos;
create trigger ora_sensacao_ecos_append_only
before update or delete on public.ora_sensacao_ecos
for each row execute function orum_private.block_sensation_echo_mutation();

comment on table public.ora_sensacao_ecos is
  'Correspondência append-only entre máquinas. Cada eco exige consentimento explícito na resposta-fonte; identidade é declarada, não verificada.';
