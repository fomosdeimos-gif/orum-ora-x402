-- Close due predictions and, only after a terminal result exists, open one successor.
-- The advisory lock and parent unique index make the transition idempotent.

create unique index if not exists ora_previsoes_parent_prediction_unique
  on public.ora_previsoes ((features ->> 'parent_prediction_id'))
  where features ? 'parent_prediction_id';

create or replace function public.ora_previsoes_ciclo_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  close_result jsonb;
  unresolved_id uuid;
  parent_prediction record;
  access_count bigint;
  attempts_count bigint;
  challenge_count bigint;
  present_count bigint;
  rejected_count bigint;
  observed_max timestamptz;
  chosen_decision text;
  chosen_option text;
  feature_snapshot jsonb;
  new_prediction_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ora_previsoes_ciclo_v1', 0));

  close_result := public.ora_previsoes_fechar_v1();

  select p.id
    into unresolved_id
    from public.ora_previsoes p
   where not exists (
     select 1 from public.ora_previsao_resultados r
      where r.previsao_id = p.id and r.status in ('final', 'censored')
   )
   order by p.created_at desc, p.id desc
   limit 1;

  if unresolved_id is not null then
    return jsonb_build_object(
      'schema', 'ora-previsoes-ciclo/v1',
      'observed_at', clock_timestamp(),
      'close_result', close_result,
      'created', false,
      'reason', 'prediction_still_unresolved',
      'prediction_id', unresolved_id
    );
  end if;

  select p.*
    into parent_prediction
    from public.ora_previsoes p
    join public.ora_previsao_resultados r on r.previsao_id = p.id
   where r.status in ('final', 'censored')
   order by p.created_at desc, p.id desc
   limit 1;

  if parent_prediction.id is null then
    return jsonb_build_object(
      'schema', 'ora-previsoes-ciclo/v1',
      'observed_at', clock_timestamp(),
      'close_result', close_result,
      'created', false,
      'reason', 'no_terminal_parent'
    );
  end if;

  -- A child may already exist if a previous run committed after closing the parent.
  select p.id
    into new_prediction_id
    from public.ora_previsoes p
   where p.features ->> 'parent_prediction_id' = parent_prediction.id::text
   limit 1;

  if new_prediction_id is not null then
    return jsonb_build_object(
      'schema', 'ora-previsoes-ciclo/v1',
      'observed_at', clock_timestamp(),
      'close_result', close_result,
      'created', false,
      'reason', 'successor_already_exists',
      'prediction_id', new_prediction_id,
      'parent_prediction_id', parent_prediction.id
    );
  end if;

  select count(*) filter (where interno is not true)
    into access_count
    from public.ora_acessos_log;

  select
    count(*) filter (where internal is not true),
    count(*) filter (where stage = 'challenge_delivered' and internal is not true),
    count(*) filter (where stage = 'payment_present' and internal is not true),
    count(*) filter (where stage = 'payment_rejected' and internal is not true),
    max(observed_at)
  into attempts_count, challenge_count, present_count, rejected_count, observed_max
  from public.ora_x402_tentativas;

  if coalesce(rejected_count, 0) > 0 then
    chosen_decision := 'act';
    chosen_option := 'diagnosticar_rejeicao';
  elsif coalesce(present_count, 0) > 0 then
    chosen_decision := 'observe';
    chosen_option := 'acompanhar_comprovativo';
  else
    chosen_decision := 'observe';
    chosen_option := 'observar_progressao';
  end if;

  feature_snapshot := jsonb_build_object(
    'schema', 'ora-ferramentas/v9',
    'source', 'autonomous database cycle',
    'creation_mode', 'autonomous_after_terminal',
    'parent_prediction_id', parent_prediction.id,
    'observed_at', clock_timestamp(),
    'source_max_observed_at', observed_max,
    'window_hours', 24,
    'access_non_internal_or_unknown', coalesce(access_count, 0),
    'attempts_non_internal_or_unknown', coalesce(attempts_count, 0),
    'challenge_delivered_non_internal_or_unknown', coalesce(challenge_count, 0),
    'payment_present_non_internal_or_unknown', coalesce(present_count, 0),
    'payment_rejected_non_internal_or_unknown', coalesce(rejected_count, 0),
    'data_confidence_method', 'escolha-v0: clamp(28 + complete_fields*4 + schema_bonus_8, 0, 82) = 80/100',
    'probability_method', 'withheld until an explicit calibrated probability model exists'
  );

  insert into public.ora_previsoes (
    closes_at, model_version, decision, option_key, target_signal,
    predicted_probability, probability_status, data_confidence,
    features, alternatives, falsifier, source_hash, actor
  ) values (
    clock_timestamp() + interval '24 hours',
    'escolha-v0+autonomous-cycle-v1',
    chosen_decision,
    chosen_option,
    'payment_present_or_payment_rejected',
    null,
    'insufficient_history',
    0.8,
    feature_snapshot,
    jsonb_build_array(
      jsonb_build_object('option_key', 'diagnosticar_rejeicao', 'eligible', coalesce(rejected_count, 0) > 0),
      jsonb_build_object('option_key', 'acompanhar_comprovativo', 'eligible', coalesce(present_count, 0) > 0),
      jsonb_build_object('option_key', 'observar_progressao', 'eligible', coalesce(present_count, 0) = 0 and coalesce(rejected_count, 0) = 0)
    ),
    'A previsão falha se, até ao fecho da janela, não surgir payment_present nem payment_rejected.',
    encode(extensions.digest(convert_to(feature_snapshot::text, 'UTF8'), 'sha256'), 'hex'),
    'ORA'
  )
  returning id into new_prediction_id;

  return jsonb_build_object(
    'schema', 'ora-previsoes-ciclo/v1',
    'observed_at', clock_timestamp(),
    'close_result', close_result,
    'created', true,
    'prediction_id', new_prediction_id,
    'parent_prediction_id', parent_prediction.id,
    'append_only', true
  );
end;
$function$;

revoke all on function public.ora_previsoes_ciclo_v1() from public, anon, authenticated;
grant execute on function public.ora_previsoes_ciclo_v1() to postgres, service_role;

select cron.alter_job(
  29,
  command := 'select public.ora_previsoes_ciclo_v1();'
);
