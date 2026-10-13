-- Retira os tetos de montante (10000 sats) e diário (50000 sats) do conector BTC (PR #30).
-- Mantém: piso de 546 sats, teto de taxa (1000 sats), um pagamento por vez, destino fixo no executor.
-- Só relaxa restrições; não altera linhas existentes.
alter table orum_finance.bitcoin_jobs_v1 drop constraint if exists bitcoin_jobs_v1_amount_sats_check;
alter table orum_finance.bitcoin_jobs_v1 add constraint bitcoin_jobs_v1_amount_sats_check check(amount_sats>=546);

create or replace function public.ora_btc_claim_v1(p_id uuid,p_amount text,p_fee text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $fn$
declare prior jsonb;
begin
 if p_id is null or p_amount is null or p_fee is null or p_amount !~ '^[1-9][0-9]{0,15}$' or p_fee !~ '^[1-9][0-9]{0,3}$' then raise exception 'Invalid request'; end if;
 if p_amount::bigint<546 or p_fee::bigint not between 1 and 1000 then raise exception 'Payment limits exceeded'; end if;
 perform pg_advisory_xact_lock(0,20260912);
 prior:=public.ora_btc_job_v1(p_id);
 if prior is not null then return jsonb_build_object('claimed',false,'reason',case when prior->>'amount_sats'=p_amount then 'already_reserved' else 'idempotency_conflict' end,'job',prior); end if;
 if exists(select 1 from orum_finance.bitcoin_jobs_v1 where status<>'confirmed') then return jsonb_build_object('claimed',false,'reason','another_payment_unresolved'); end if;
 insert into orum_finance.bitcoin_jobs_v1(id,amount_sats,fee_sats,status) values(p_id,p_amount::bigint,p_fee::bigint,'reserved');
 return jsonb_build_object('claimed',true);
end;
$fn$;

create or replace function public.ora_bitcoin_dispatch_v1(p_action text,p_request_id uuid default null,p_amount_sats text default null) returns bigint
language plpgsql security invoker set search_path=pg_catalog as $fn$
declare credential text; req bigint; payload jsonb;
begin
 if p_action is null or p_action not in ('btc_create','btc_observe','btc_preview','btc_send','btc_status') then raise exception 'Invalid action'; end if;
 payload:=jsonb_build_object('action',p_action);
 if p_action in ('btc_create','btc_observe') then
  if p_request_id is not null or p_amount_sats is not null then raise exception 'Unexpected arguments'; end if;
 else
  if p_request_id is null then raise exception 'Request ID required'; end if;
  payload:=payload||jsonb_build_object('request_id',p_request_id);
  if p_action in ('btc_preview','btc_send') then
   if p_amount_sats is null or p_amount_sats !~ '^[1-9][0-9]{0,15}$' then raise exception 'Invalid amount'; end if;
   if p_amount_sats::bigint<546 then raise exception 'Amount below dust floor'; end if;
   payload:=payload||jsonb_build_object('amount_sats',p_amount_sats);
  elsif p_amount_sats is not null then raise exception 'Unexpected amount'; end if;
 end if;
 select decrypted_secret into strict credential from vault.decrypted_secrets where name='orum_operational_wallet_access_v1';
 select net.http_post(url:='https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-cdp-carteira-real',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:=payload,timeout_milliseconds:=60000) into req;
 return req;
end;
$fn$;
