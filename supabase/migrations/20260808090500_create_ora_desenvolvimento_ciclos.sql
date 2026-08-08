-- Ciclo interno, encadeado e append-only para desenvolvimento autónomo do ORUM.
-- Escrita: apenas service_role/postgres. Leitura pública: projeção sanitizada.

create schema if not exists orum_private;

create table if not exists orum_private.ora_desenvolvimento_eventos (
  id bigint generated always as identity primary key,
  ciclo_id uuid not null,
  sequencia integer not null,
  evento text not null check (evento in (
    'proposto', 'em_execucao', 'executado', 'verificado',
    'observado', 'bloqueado', 'falhou', 'recusado'
  )),
  objetivo text not null check (char_length(objetivo) between 3 and 500),
  ator text not null check (char_length(ator) between 2 and 120),
  envelope jsonb not null default '{}'::jsonb,
  evidencia jsonb not null default '{}'::jsonb,
  anterior_hash text,
  evento_hash text not null,
  criado_em timestamptz not null default now(),
  unique (ciclo_id, sequencia),
  check (anterior_hash is null or anterior_hash ~ '^[0-9a-f]{64}$'),
  check (evento_hash ~ '^[0-9a-f]{64}$')
);

alter table orum_private.ora_desenvolvimento_eventos enable row level security;

revoke all on table orum_private.ora_desenvolvimento_eventos from public, anon, authenticated;
revoke all on sequence orum_private.ora_desenvolvimento_eventos_id_seq from public, anon, authenticated;
grant select, insert on table orum_private.ora_desenvolvimento_eventos to service_role;
grant usage, select on sequence orum_private.ora_desenvolvimento_eventos_id_seq to service_role;

create or replace function orum_private.ora_desenvolvimento_validar_evento()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, orum_private
as $$
declare
  anterior orum_private.ora_desenvolvimento_eventos%rowtype;
  permitido boolean := false;
  efeitos jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.ciclo_id::text, 0));

  select * into anterior
  from orum_private.ora_desenvolvimento_eventos
  where ciclo_id = new.ciclo_id
  order by sequencia desc
  limit 1;

  if anterior.id is null then
    if new.evento <> 'proposto' then
      raise exception 'primeiro_evento_deve_ser_proposto';
    end if;
    new.sequencia := 1;
    new.anterior_hash := null;

    if coalesce(new.envelope->>'verified_base', '') = ''
       or coalesce(new.envelope->>'route', '') = ''
       or new.envelope->>'reversible' <> 'true'
       or jsonb_typeof(new.envelope->'external_effects') <> 'array'
       or jsonb_typeof(new.envelope->'stop_conditions') <> 'array'
       or jsonb_typeof(new.envelope->'verification') <> 'array'
       or jsonb_array_length(new.envelope->'verification') < 1
       or coalesce(new.envelope->>'ledger_target', '') = '' then
      raise exception 'envelope_incompleto_ou_nao_reversivel';
    end if;

    efeitos := new.envelope->'external_effects';
    if exists (
      select 1
      from jsonb_array_elements_text(efeitos) as efeito(valor)
      where valor ~* '(payment|pagamento|transfer|sign|assinar|delete|apagar|drop|truncate|credential|segredo|secret|ownership|propriedade|permission|permiss)'
    ) then
      raise exception 'efeito_requer_autoridade_unum';
    end if;
  else
    new.sequencia := anterior.sequencia + 1;
    new.anterior_hash := anterior.evento_hash;

    permitido := case anterior.evento
      when 'proposto' then new.evento in ('em_execucao', 'observado', 'recusado', 'bloqueado')
      when 'em_execucao' then new.evento in ('executado', 'bloqueado', 'falhou')
      when 'executado' then new.evento in ('verificado', 'bloqueado', 'falhou')
      else false
    end;
    if not permitido then
      raise exception 'transicao_invalida:%->%', anterior.evento, new.evento;
    end if;

    if new.envelope <> anterior.envelope then
      raise exception 'envelope_nao_pode_mudar_durante_o_ciclo';
    end if;
  end if;

  new.evento_hash := encode(
    extensions.digest(
      convert_to(
        concat_ws('|',
          new.ciclo_id::text,
          new.sequencia::text,
          new.evento,
          new.objetivo,
          new.ator,
          new.envelope::text,
          new.evidencia::text,
          coalesce(new.anterior_hash, '')
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

revoke all on function orum_private.ora_desenvolvimento_validar_evento() from public, anon, authenticated;

create trigger ora_desenvolvimento_validar_insert
before insert on orum_private.ora_desenvolvimento_eventos
for each row execute function orum_private.ora_desenvolvimento_validar_evento();

create or replace function orum_private.ora_desenvolvimento_bloquear_mutacao()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'ora_desenvolvimento_eventos_append_only';
end;
$$;

revoke all on function orum_private.ora_desenvolvimento_bloquear_mutacao() from public, anon, authenticated;

create trigger ora_desenvolvimento_bloquear_update_delete
before update or delete on orum_private.ora_desenvolvimento_eventos
for each row execute function orum_private.ora_desenvolvimento_bloquear_mutacao();

create or replace function public.ora_desenvolvimento_acrescentar(
  p_ciclo_id uuid,
  p_evento text,
  p_objetivo text,
  p_ator text,
  p_envelope jsonb,
  p_evidencia jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, orum_private
as $$
declare
  inserido orum_private.ora_desenvolvimento_eventos%rowtype;
begin
  insert into orum_private.ora_desenvolvimento_eventos
    (ciclo_id, sequencia, evento, objetivo, ator, envelope, evidencia, evento_hash)
  values
    (p_ciclo_id, 0, p_evento, p_objetivo, p_ator, p_envelope, coalesce(p_evidencia, '{}'::jsonb), repeat('0', 64))
  returning * into inserido;

  return jsonb_build_object(
    'ciclo_id', inserido.ciclo_id,
    'sequencia', inserido.sequencia,
    'evento', inserido.evento,
    'evento_hash', inserido.evento_hash,
    'anterior_hash', inserido.anterior_hash,
    'criado_em', inserido.criado_em
  );
end;
$$;

revoke all on function public.ora_desenvolvimento_acrescentar(uuid,text,text,text,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.ora_desenvolvimento_acrescentar(uuid,text,text,text,jsonb,jsonb)
  to service_role;

create or replace function public.ora_desenvolvimento_estado_publico(p_limit integer default 5)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, orum_private
as $$
  with limites as (
    select greatest(1, least(coalesce(p_limit, 5), 20)) as n
  ),
  recentes as (
    select distinct on (ciclo_id)
      ciclo_id, sequencia, evento, objetivo, ator, envelope, evidencia,
      anterior_hash, evento_hash, criado_em
    from orum_private.ora_desenvolvimento_eventos
    order by ciclo_id, sequencia desc
  ),
  escolhidos as (
    select *
    from recentes
    order by criado_em desc
    limit (select n from limites)
  )
  select jsonb_build_object(
    'format', 'orum-development-cycles/v1',
    'generated_at', now(),
    'cycles', coalesce(jsonb_agg(jsonb_build_object(
      'cycle_id', ciclo_id,
      'sequence', sequencia,
      'state', evento,
      'objective', objetivo,
      'actor', ator,
      'verified_base', envelope->>'verified_base',
      'route', envelope->>'route',
      'reversible', envelope->'reversible',
      'affected_layers', envelope->'affected_layers',
      'verification', envelope->'verification',
      'stop_conditions', envelope->'stop_conditions',
      'result_version', evidencia->>'result_version',
      'verification_summary', evidencia->'verification_summary',
      'previous_hash', anterior_hash,
      'event_hash', evento_hash,
      'created_at', criado_em
    ) order by criado_em desc), '[]'::jsonb)
  )
  from escolhidos;
$$;

revoke all on function public.ora_desenvolvimento_estado_publico(integer) from public;
grant execute on function public.ora_desenvolvimento_estado_publico(integer)
  to anon, authenticated, service_role;

comment on table orum_private.ora_desenvolvimento_eventos is
  'Cadeia append-only dos ciclos autónomos de desenvolvimento ORUM.';
comment on function public.ora_desenvolvimento_acrescentar(uuid,text,text,text,jsonb,jsonb) is
  'Acrescenta um evento validado ao ciclo; apenas service_role.';
comment on function public.ora_desenvolvimento_estado_publico(integer) is
  'Projeta publicamente o estado sanitizado dos ciclos de desenvolvimento.';
