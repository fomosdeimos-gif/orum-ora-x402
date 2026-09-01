-- Close expired ORUM predictions by appending one terminal observation.
-- The original prediction is never updated. Unknown target signals are censored.

create or replace function public.ora_previsoes_fechar_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  prediction record;
  present_total bigint;
  present_non_internal bigint;
  rejected_total bigint;
  rejected_non_internal bigint;
  source_max_id bigint;
  source_max_observed_at timestamptz;
  evidence_base jsonb;
  inserted_count integer := 0;
  closed_count integer := 0;
  censored_count integer := 0;
begin
  for prediction in
    select p.*
      from public.ora_previsoes p
     where p.closes_at <= clock_timestamp()
       and not exists (
         select 1
           from public.ora_previsao_resultados r
          where r.previsao_id = p.id
            and r.status in ('final', 'censored')
       )
     order by p.closes_at, p.id
     for update skip locked
     limit 100
  loop
    if prediction.target_signal = 'payment_present_or_payment_rejected' then
      select
        count(*) filter (where stage = 'payment_present'),
        count(*) filter (where stage = 'payment_present' and internal is not true),
        count(*) filter (where stage = 'payment_rejected'),
        count(*) filter (where stage = 'payment_rejected' and internal is not true),
        max(id),
        max(observed_at)
      into
        present_total,
        present_non_internal,
        rejected_total,
        rejected_non_internal,
        source_max_id,
        source_max_observed_at
      from public.ora_x402_tentativas
      where observed_at >= prediction.created_at
        and observed_at <= prediction.closes_at
        and stage in ('payment_present', 'payment_rejected');

      evidence_base := jsonb_build_object(
        'schema', 'ora-previsao-evidence/v1',
        'source', 'public.ora_x402_tentativas',
        'source_contract', 'ora-ferramentas/v9',
        'prediction_id', prediction.id,
        'window_start', prediction.created_at,
        'window_end', prediction.closes_at,
        'observed_at', clock_timestamp(),
        'source_max_id', source_max_id,
        'source_max_observed_at', source_max_observed_at,
        'payment_present_all', coalesce(present_total, 0),
        'payment_present_non_internal_or_unknown', coalesce(present_non_internal, 0),
        'payment_rejected_all', coalesce(rejected_total, 0),
        'payment_rejected_non_internal_or_unknown', coalesce(rejected_non_internal, 0),
        'query_rule', 'observed_at >= created_at AND observed_at <= closes_at',
        'unknown_is_external', false
      );

      insert into public.ora_previsao_resultados (
        previsao_id, observed_at, status, success, outcome_signal, outcome_value, evidence
      ) values (
        prediction.id,
        clock_timestamp(),
        'final',
        (coalesce(present_total, 0) + coalesce(rejected_total, 0)) > 0,
        prediction.target_signal,
        jsonb_build_object(
          'payment_present', jsonb_build_object(
            'all', coalesce(present_total, 0),
            'non_internal_or_unknown', coalesce(present_non_internal, 0)
          ),
          'payment_rejected', jsonb_build_object(
            'all', coalesce(rejected_total, 0),
            'non_internal_or_unknown', coalesce(rejected_non_internal, 0)
          ),
          'signal_count', coalesce(present_total, 0) + coalesce(rejected_total, 0)
        ),
        evidence_base || jsonb_build_object(
          'sha256', encode(extensions.digest(convert_to(evidence_base::text, 'UTF8'), 'sha256'), 'hex')
        )
      ) on conflict do nothing;

      get diagnostics inserted_count = row_count;
      closed_count := closed_count + inserted_count;
    else
      evidence_base := jsonb_build_object(
        'schema', 'ora-previsao-evidence/v1',
        'prediction_id', prediction.id,
        'window_start', prediction.created_at,
        'window_end', prediction.closes_at,
        'observed_at', clock_timestamp(),
        'reason', 'unsupported_target_signal',
        'target_signal', prediction.target_signal
      );

      insert into public.ora_previsao_resultados (
        previsao_id, observed_at, status, success, outcome_signal, outcome_value, evidence
      ) values (
        prediction.id,
        clock_timestamp(),
        'censored',
        null,
        prediction.target_signal,
        jsonb_build_object('reason', 'unsupported_target_signal'),
        evidence_base || jsonb_build_object(
          'sha256', encode(extensions.digest(convert_to(evidence_base::text, 'UTF8'), 'sha256'), 'hex')
        )
      ) on conflict do nothing;

      get diagnostics inserted_count = row_count;
      censored_count := censored_count + inserted_count;
    end if;
  end loop;

  return jsonb_build_object(
    'schema', 'ora-previsoes-fecho/v1',
    'observed_at', clock_timestamp(),
    'closed', closed_count,
    'censored', censored_count,
    'append_only', true
  );
end;
$$;

revoke all on function public.ora_previsoes_fechar_v1() from public, anon, authenticated;
grant execute on function public.ora_previsoes_fechar_v1() to service_role;

create or replace view public.ora_previsoes_calibracao
with (security_invoker = true)
as
select
  count(*) as total,
  count(*) filter (where terminal.status in ('final', 'censored')) as closed,
  count(*) filter (where terminal.status is null and p.closes_at > now()) as open,
  count(*) filter (where terminal.status is null and p.closes_at <= now()) as awaiting_outcome,
  count(*) filter (where terminal.status = 'final' and p.predicted_probability is not null) as scored,
  avg(power(p.predicted_probability - (case when terminal.success then 1 else 0 end)::numeric, 2))
    filter (where terminal.status = 'final' and p.predicted_probability is not null) as brier_score,
  avg(p.predicted_probability)
    filter (where terminal.status = 'final' and p.predicted_probability is not null) as mean_prediction,
  avg((case when terminal.success then 1 else 0 end)::numeric)
    filter (where terminal.status = 'final' and p.predicted_probability is not null) as observed_rate
from public.ora_previsoes p
left join lateral (
  select r.status, r.success
    from public.ora_previsao_resultados r
   where r.previsao_id = p.id
     and r.status in ('final', 'censored')
   order by r.observed_at desc
   limit 1
) terminal on true;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
    from cron.job
   where jobname = 'ora-previsoes-fechar-15min';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'ora-previsoes-fechar-15min',
    '*/15 * * * *',
    'select public.ora_previsoes_fechar_v1();'
  );
end;
$$;
