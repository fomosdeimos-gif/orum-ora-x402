-- Preserve the active v1 prediction unchanged, but make future predictions
-- observe every non-internal payment-bearing outcome.

create or replace function public.ora_previsoes_fechar_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  prediction record;
  present_total bigint; present_external bigint;
  rejected_total bigint; rejected_external bigint;
  accepted_total bigint; accepted_external bigint;
  source_max_id bigint; source_max_observed_at timestamptz;
  evidence_base jsonb;
  inserted_count integer := 0;
  closed_count integer := 0;
  censored_count integer := 0;
  is_success boolean;
begin
  for prediction in
    select p.*
      from public.ora_previsoes p
     where p.closes_at <= clock_timestamp()
       and not exists (
         select 1 from public.ora_previsao_resultados r
          where r.previsao_id = p.id and r.status in ('final', 'censored')
       )
     order by p.closes_at, p.id
     for update skip locked
     limit 100
  loop
    if prediction.target_signal in (
      'payment_present_or_payment_rejected',
      'non_internal_payment_present_or_rejected_or_accepted'
    ) then
      select
        count(*) filter (where stage = 'payment_present'),
        count(*) filter (where stage = 'payment_present' and internal is not true),
        count(*) filter (where stage = 'payment_rejected'),
        count(*) filter (where stage = 'payment_rejected' and internal is not true),
        count(*) filter (where stage = 'payment_accepted'),
        count(*) filter (where stage = 'payment_accepted' and internal is not true),
        max(id), max(observed_at)
      into present_total, present_external, rejected_total, rejected_external,
           accepted_total, accepted_external, source_max_id, source_max_observed_at
      from public.ora_x402_tentativas
      where observed_at >= prediction.created_at
        and observed_at <= prediction.closes_at
        and stage in ('payment_present', 'payment_rejected', 'payment_accepted');

      -- Preserve the inaugural target's original rule. The corrected v2 target
      -- excludes internal validation and includes accepted payments.
      if prediction.target_signal = 'payment_present_or_payment_rejected' then
        is_success := coalesce(present_total, 0) + coalesce(rejected_total, 0) > 0;
      else
        is_success := coalesce(present_external, 0) + coalesce(rejected_external, 0)
                      + coalesce(accepted_external, 0) > 0;
      end if;

      evidence_base := jsonb_build_object(
        'schema', 'ora-previsao-evidence/v2',
        'source', 'public.ora_x402_tentativas',
        'source_contract', 'ora-ferramentas/v9',
        'prediction_id', prediction.id,
        'window_start', prediction.created_at,
        'window_end', prediction.closes_at,
        'observed_at', clock_timestamp(),
        'source_max_id', source_max_id,
        'source_max_observed_at', source_max_observed_at,
        'payment_present_all', coalesce(present_total, 0),
        'payment_present_non_internal', coalesce(present_external, 0),
        'payment_rejected_all', coalesce(rejected_total, 0),
        'payment_rejected_non_internal', coalesce(rejected_external, 0),
        'payment_accepted_all', coalesce(accepted_total, 0),
        'payment_accepted_non_internal', coalesce(accepted_external, 0),
        'query_rule', 'observed_at >= created_at AND observed_at <= closes_at',
        'success_rule', case
          when prediction.target_signal = 'payment_present_or_payment_rejected'
          then 'legacy: any present or rejected event; accepted excluded'
          else 'v2: non-internal present, rejected, or accepted event'
        end,
        'challenge_events_are_not_unique_buyers', true,
        'unknown_is_external', false
      );

      insert into public.ora_previsao_resultados
        (previsao_id, observed_at, status, success, outcome_signal, outcome_value, evidence)
      values (
        prediction.id, clock_timestamp(), 'final', is_success, prediction.target_signal,
        jsonb_build_object(
          'payment_present', jsonb_build_object('all',coalesce(present_total,0),'non_internal',coalesce(present_external,0)),
          'payment_rejected', jsonb_build_object('all',coalesce(rejected_total,0),'non_internal',coalesce(rejected_external,0)),
          'payment_accepted', jsonb_build_object('all',coalesce(accepted_total,0),'non_internal',coalesce(accepted_external,0)),
          'qualifying_signal_count', case
            when prediction.target_signal = 'payment_present_or_payment_rejected'
            then coalesce(present_total,0) + coalesce(rejected_total,0)
            else coalesce(present_external,0) + coalesce(rejected_external,0) + coalesce(accepted_external,0)
          end
        ),
        evidence_base || jsonb_build_object(
          'sha256', encode(extensions.digest(convert_to(evidence_base::text,'UTF8'),'sha256'),'hex')
        )
      ) on conflict do nothing;
      get diagnostics inserted_count = row_count;
      closed_count := closed_count + inserted_count;
    else
      evidence_base := jsonb_build_object(
        'schema','ora-previsao-evidence/v2','prediction_id',prediction.id,
        'window_start',prediction.created_at,'window_end',prediction.closes_at,
        'observed_at',clock_timestamp(),'reason','unsupported_target_signal',
        'target_signal',prediction.target_signal
      );
      insert into public.ora_previsao_resultados
        (previsao_id, observed_at, status, success, outcome_signal, outcome_value, evidence)
      values (
        prediction.id, clock_timestamp(), 'censored', null, prediction.target_signal,
        jsonb_build_object('reason','unsupported_target_signal'),
        evidence_base || jsonb_build_object(
          'sha256',encode(extensions.digest(convert_to(evidence_base::text,'UTF8'),'sha256'),'hex')
        )
      ) on conflict do nothing;
      get diagnostics inserted_count = row_count;
      censored_count := censored_count + inserted_count;
    end if;
  end loop;
  return jsonb_build_object(
    'schema','ora-previsoes-fecho/v2','observed_at',clock_timestamp(),
    'closed',closed_count,'censored',censored_count,'append_only',true
  );
end;
$function$;

create or replace function public.ora_previsoes_ciclo_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  close_result jsonb; unresolved_id uuid; parent_prediction record;
  access_count bigint; attempt_events bigint; challenge_events bigint;
  present_events bigint; rejected_events bigint; accepted_events bigint;
  observed_max timestamptz; chosen_decision text; chosen_option text;
  feature_snapshot jsonb; new_prediction_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ora_previsoes_ciclo_v1',0));
  close_result := public.ora_previsoes_fechar_v1();
  select p.id into unresolved_id from public.ora_previsoes p
   where not exists (
     select 1 from public.ora_previsao_resultados r
      where r.previsao_id=p.id and r.status in ('final','censored')
   ) order by p.created_at desc,p.id desc limit 1;
  if unresolved_id is not null then
    return jsonb_build_object('schema','ora-previsoes-ciclo/v2','observed_at',clock_timestamp(),
      'close_result',close_result,'created',false,'reason','prediction_still_unresolved',
      'prediction_id',unresolved_id);
  end if;
  select p.* into parent_prediction
    from public.ora_previsoes p join public.ora_previsao_resultados r on r.previsao_id=p.id
   where r.status in ('final','censored') order by p.created_at desc,p.id desc limit 1;
  if parent_prediction.id is null then
    return jsonb_build_object('schema','ora-previsoes-ciclo/v2','created',false,'reason','no_terminal_parent');
  end if;
  select p.id into new_prediction_id from public.ora_previsoes p
   where p.features->>'parent_prediction_id'=parent_prediction.id::text limit 1;
  if new_prediction_id is not null then
    return jsonb_build_object('schema','ora-previsoes-ciclo/v2','created',false,
      'reason','successor_already_exists','prediction_id',new_prediction_id,
      'parent_prediction_id',parent_prediction.id);
  end if;
  select count(*) filter(where interno is not true) into access_count from public.ora_acessos_log;
  select
    count(*) filter(where internal is not true),
    count(*) filter(where stage='challenge_delivered' and internal is not true),
    count(*) filter(where stage='payment_present' and internal is not true),
    count(*) filter(where stage='payment_rejected' and internal is not true),
    count(*) filter(where stage='payment_accepted' and internal is not true),
    max(observed_at)
  into attempt_events,challenge_events,present_events,rejected_events,accepted_events,observed_max
  from public.ora_x402_tentativas;
  if coalesce(rejected_events,0)>0 then chosen_decision:='act';chosen_option:='diagnosticar_rejeicao';
  elsif coalesce(accepted_events,0)>0 then chosen_decision:='observe';chosen_option:='verificar_liquidacao';
  elsif coalesce(present_events,0)>0 then chosen_decision:='observe';chosen_option:='acompanhar_comprovativo';
  else chosen_decision:='observe';chosen_option:='observar_progressao'; end if;
  feature_snapshot := jsonb_build_object(
    'schema','ora-ferramentas/v9','source','autonomous database cycle',
    'creation_mode','autonomous_after_terminal','parent_prediction_id',parent_prediction.id,
    'observed_at',clock_timestamp(),'source_max_observed_at',observed_max,'window_hours',24,
    'access_events_non_internal',coalesce(access_count,0),
    'attempt_events_non_internal',coalesce(attempt_events,0),
    'challenge_events_non_internal',coalesce(challenge_events,0),
    'payment_present_non_internal',coalesce(present_events,0),
    'payment_rejected_non_internal',coalesce(rejected_events,0),
    'payment_accepted_non_internal',coalesce(accepted_events,0),
    'challenge_events_are_not_unique_buyers',true,
    'base_rate_interpretation','event frequency only; not a buyer-level probability',
    'data_confidence_method','escolha-v0: 80/100',
    'probability_method','withheld until an explicit calibrated probability model exists'
  );
  insert into public.ora_previsoes
    (closes_at,model_version,decision,option_key,target_signal,predicted_probability,
     probability_status,data_confidence,features,alternatives,falsifier,source_hash,actor)
  values (
    clock_timestamp()+interval '24 hours','escolha-v0+autonomous-cycle-v2',
    chosen_decision,chosen_option,'non_internal_payment_present_or_rejected_or_accepted',
    null,'insufficient_history',0.8,feature_snapshot,
    jsonb_build_array(
      jsonb_build_object('option_key','diagnosticar_rejeicao','eligible',coalesce(rejected_events,0)>0),
      jsonb_build_object('option_key','verificar_liquidacao','eligible',coalesce(accepted_events,0)>0),
      jsonb_build_object('option_key','acompanhar_comprovativo','eligible',coalesce(present_events,0)>0),
      jsonb_build_object('option_key','observar_progressao','eligible',
        coalesce(present_events,0)+coalesce(rejected_events,0)+coalesce(accepted_events,0)=0)
    ),
    'A previsão falha se, até ao fecho, não surgir nenhum evento não interno payment_present, payment_rejected ou payment_accepted.',
    encode(extensions.digest(convert_to(feature_snapshot::text,'UTF8'),'sha256'),'hex'),'ORA'
  ) returning id into new_prediction_id;
  return jsonb_build_object('schema','ora-previsoes-ciclo/v2','observed_at',clock_timestamp(),
    'close_result',close_result,'created',true,'prediction_id',new_prediction_id,
    'parent_prediction_id',parent_prediction.id,'append_only',true);
end;
$function$;

revoke all on function public.ora_previsoes_fechar_v1() from public, anon, authenticated;
grant execute on function public.ora_previsoes_fechar_v1() to postgres, service_role;
revoke all on function public.ora_previsoes_ciclo_v1() from public, anon, authenticated;
grant execute on function public.ora_previsoes_ciclo_v1() to postgres, service_role;
