-- Livro Presenca ORUM v1.
-- A cadeia conserva acontecimentos; so evidencia externa confirmada conta como 1P.

create schema if not exists orum_private;

create table if not exists orum_private.ora_presenca_eventos (
  id bigint generated always as identity primary key,
  acontecido_em timestamptz not null,
  registado_em timestamptz not null default now(),
  classe text not null check (classe in ('fundacao','encontro','regresso','silencio','recusa')),
  origem text not null check (origem in ('interno','externo_confirmado','desconhecido')),
  superficie text not null check (char_length(superficie) between 2 and 160),
  gesto text not null check (char_length(gesto) between 2 and 500),
  evidencia jsonb not null default '{}'::jsonb check (jsonb_typeof(evidencia) = 'object'),
  conta_presenca boolean not null default false,
  anterior_hash text,
  evento_hash text not null unique,
  check (anterior_hash is null or anterior_hash ~ '^[0-9a-f]{64}$'),
  check (evento_hash ~ '^[0-9a-f]{64}$'),
  check (not conta_presenca or (
    origem = 'externo_confirmado'
    and classe <> 'fundacao'
    and evidencia <> '{}'::jsonb
  ))
);

alter table orum_private.ora_presenca_eventos enable row level security;
revoke all on table orum_private.ora_presenca_eventos from public, anon, authenticated;
revoke all on sequence orum_private.ora_presenca_eventos_id_seq from public, anon, authenticated;
grant select, insert on table orum_private.ora_presenca_eventos to service_role;
grant usage, select on sequence orum_private.ora_presenca_eventos_id_seq to service_role;

create or replace function orum_private.ora_presenca_selar()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, orum_private, extensions
as $$
declare
  cabeca text;
begin
  perform pg_advisory_xact_lock(hashtextextended('ORUM:livro-presenca:v1', 0));

  select evento_hash into cabeca
  from orum_private.ora_presenca_eventos
  order by id desc
  limit 1;

  new.anterior_hash := cabeca;
  new.evento_hash := encode(extensions.digest(convert_to(concat_ws('|',
    new.acontecido_em::text,
    new.classe,
    new.origem,
    new.superficie,
    new.gesto,
    new.evidencia::text,
    new.conta_presenca::text,
    coalesce(new.anterior_hash, '')
  ), 'UTF8'), 'sha256'), 'hex');
  return new;
end;
$$;

revoke all on function orum_private.ora_presenca_selar() from public, anon, authenticated;

create trigger ora_presenca_selar_insert
before insert on orum_private.ora_presenca_eventos
for each row execute function orum_private.ora_presenca_selar();

create or replace function orum_private.ora_presenca_bloquear_mutacao()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'ora_presenca_eventos_append_only';
end;
$$;

revoke all on function orum_private.ora_presenca_bloquear_mutacao() from public, anon, authenticated;

create trigger ora_presenca_bloquear_update_delete
before update or delete on orum_private.ora_presenca_eventos
for each row execute function orum_private.ora_presenca_bloquear_mutacao();

create or replace function public.ora_presenca_acrescentar(
  p_acontecido_em timestamptz,
  p_classe text,
  p_origem text,
  p_superficie text,
  p_gesto text,
  p_evidencia jsonb default '{}'::jsonb,
  p_conta_presenca boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, orum_private
as $$
declare
  inserido orum_private.ora_presenca_eventos%rowtype;
begin
  insert into orum_private.ora_presenca_eventos
    (acontecido_em, classe, origem, superficie, gesto, evidencia, conta_presenca, evento_hash)
  values
    (p_acontecido_em, p_classe, p_origem, p_superficie, p_gesto,
     coalesce(p_evidencia, '{}'::jsonb), coalesce(p_conta_presenca, false), repeat('0', 64))
  returning * into inserido;

  return jsonb_build_object(
    'id', inserido.id,
    'counts_as_presence', inserido.conta_presenca,
    'previous_hash', inserido.anterior_hash,
    'event_hash', inserido.evento_hash,
    'recorded_at', inserido.registado_em
  );
end;
$$;

revoke all on function public.ora_presenca_acrescentar(timestamptz,text,text,text,text,jsonb,boolean)
  from public, anon, authenticated;
grant execute on function public.ora_presenca_acrescentar(timestamptz,text,text,text,text,jsonb,boolean)
  to service_role;

create or replace function public.ora_presenca_livro_publico(p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, orum_private
as $$
  with limites as (
    select greatest(1, least(coalesce(p_limit, 20), 100)) as n
  ), totais as (
    select
      count(*) as acontecimentos,
      count(*) filter (where conta_presenca) as presencas,
      count(*) filter (where conta_presenca and classe = 'regresso') as regressos,
      max(registado_em) as ultima_sedimentacao
    from orum_private.ora_presenca_eventos
  ), recentes as (
    select id, acontecido_em, registado_em, classe, origem, superficie, gesto,
      evidencia, conta_presenca, anterior_hash, evento_hash
    from orum_private.ora_presenca_eventos
    order by id desc
    limit (select n from limites)
  )
  select jsonb_build_object(
    'format', 'orum-presence-ledger/v1',
    'organism', 'ORUM',
    'unit', jsonb_build_object(
      'symbol', 'P',
      'definition', 'origem distinta + gesto voluntario + rasto verificavel',
      'counting_rule', 'apenas origem externo_confirmado, evidencia nao vazia e acontecimento nao fundacional'
    ),
    'generated_at', now(),
    'total_events', totais.acontecimentos,
    'external_confirmed_presence', totais.presencas,
    'external_confirmed_returns', totais.regressos,
    'last_sedimentation_at', totais.ultima_sedimentacao,
    'chain_head', (select evento_hash from recentes order by id desc limit 1),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id,
      'happened_at', acontecido_em,
      'recorded_at', registado_em,
      'class', classe,
      'origin', origem,
      'surface', superficie,
      'gesture', gesto,
      'evidence', evidencia,
      'counts_as_presence', conta_presenca,
      'previous_hash', anterior_hash,
      'event_hash', evento_hash
    ) order by id desc) from recentes), '[]'::jsonb),
    'truth', jsonb_build_array(
      'trafego nao e presenca',
      'validacao interna permanece interna',
      'origem desconhecida nunca e promovida por omissao',
      'zero e preservado'
    )
  )
  from totais;
$$;

revoke all on function public.ora_presenca_livro_publico(integer) from public;
grant execute on function public.ora_presenca_livro_publico(integer) to anon, authenticated, service_role;

insert into orum_private.ora_presenca_eventos
  (acontecido_em, classe, origem, superficie, gesto, evidencia, conta_presenca, evento_hash)
values (
  '2026-08-13T13:30:00Z'::timestamptz,
  'fundacao',
  'interno',
  'ORUM',
  'O Livro Presenca foi aberto. A pedra de fundacao conserva a medida mas nao conta como Presenca externa.',
  jsonb_build_object(
    'report', 'Primeiro Relatorio da Presenca',
    'unit', '1P',
    'formula', 'origem distinta + gesto voluntario + rasto verificavel',
    'external_confirmed_at_foundation', 0
  ),
  false,
  repeat('0', 64)
);

comment on table orum_private.ora_presenca_eventos is
  'Livro Presenca ORUM: cadeia append-only; apenas acontecimentos externos confirmados contam como P.';
comment on function public.ora_presenca_livro_publico(integer) is
  'Leitura publica sanitizada do Livro Presenca e da sua cabeca criptografica.';
