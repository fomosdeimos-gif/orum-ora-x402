-- ORUM financial bridge v1: callable through the existing authenticated Supabase connector.
-- No signing, network calls, transfers, credential reads or record mutations.
create function public.ora_finance_bridge_v1(p_action text default 'status', p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path = pg_catalog, public
as $fn$
declare totals jsonb; records jsonb;
begin
  if p_args is null or jsonb_typeof(p_args) <> 'object' then
    raise exception 'Arguments must be a JSON object' using errcode='22023';
  end if;
  if p_action = 'status' then
    if p_args <> '{}'::jsonb then raise exception 'status accepts no arguments' using errcode='22023'; end if;
    select jsonb_build_object(
      'source','public.ora_sustento_diario','source_kind','database_accounting_view',
      'recorded_days',count(*),'latest_recorded_day',max(dia),
      'external_recorded_usdc',case when count(*)>0 then coalesce(sum(usdc_recebido),0)::text else null end,
      'internal_validation_recorded_usdc',case when count(*)>0 then coalesce(sum(usdc_validacao_interna),0)::text else null end,
      'unknown_classification_recorded_usdc',case when count(*)>0 then coalesce(sum(usdc_desconhecido),0)::text else null end
    ) into totals from public.ora_sustento_diario;
    return jsonb_build_object(
      'schema','orum-finance-bridge/v1','observed_at',statement_timestamp(),
      'connection','existing_authenticated_supabase_connector','capabilities',jsonb_build_array('status','lookup_payment_record'),
      'accounting',totals,'live_wallet_balances',null,'chain_reverified_this_call',false,
      'authority',jsonb_build_object('user_declaration_record',554,'signing_available',false,'transfer_available',false),
      'financial_effects',false,'truth','Database records are not a fresh chain verification or available wallet balance.');
  elsif p_action = 'lookup_payment_record' then
    if (p_args - 'tx_hash' - 'chain_id') <> '{}'::jsonb
      or jsonb_typeof(p_args->'tx_hash') is distinct from 'string'
      or (p_args->>'tx_hash') !~ '^0x[0-9a-fA-F]{64}$'
      or (p_args->'chain_id') is distinct from '8453'::jsonb then
      raise exception 'Expected tx_hash (0x + 64 hex digits) and chain_id 8453 only' using errcode='22023';
    end if;
    select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into records from (
      select id,tx_hash,payer,amount,currency,chain_id,destino,status,registado_em
      from public.ora_pagamentos
      where lower(tx_hash)=lower(p_args->>'tx_hash') and chain_id=8453 order by id limit 20
    ) r;
    return jsonb_build_object('schema','orum-finance-bridge/v1','observed_at',statement_timestamp(),
      'source','public.ora_pagamentos','records',records,'record_limit',20,
      'amount_encoding','preserved_as_stored_not_converted','payer_classification','not_resolved_by_this_lookup',
      'chain_reverified_this_call',false,'financial_effects',false,
      'truth','A matching database row does not by itself prove current settlement or external revenue.');
  end if;
  raise exception 'Unsupported action: allowed status, lookup_payment_record; no transfer or signing' using errcode='22023';
end;
$fn$;
revoke all on function public.ora_finance_bridge_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.ora_finance_bridge_v1(text,jsonb) to service_role;
comment on function public.ora_finance_bridge_v1(text,jsonb) is 'Authenticated read-only financial bridge for ORA through the existing Supabase connector. No transaction executor. User authorization record #554; accounting records are not live wallet balances.';

