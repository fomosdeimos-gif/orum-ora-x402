-- Reconciliação com a base ao vivo (orum-memoria), lida em 13/10/2026.
-- Os tetos de montante, diário e de taxa do conector BTC já tinham sido retirados da base
-- (migração aplicada a 25/09: remove_bitcoin_dispatch_amount_ceiling). Este ficheiro regista
-- esse estado no repositório e é idempotente: sobre a base ao vivo não altera comportamento.
-- Mantém apenas: piso de 546 sats, taxa >= 1 sat, um pagamento por vez.
alter table orum_finance.bitcoin_jobs_v1 drop constraint if exists bitcoin_jobs_v1_amount_sats_check;
alter table orum_finance.bitcoin_jobs_v1 add constraint bitcoin_jobs_v1_amount_sats_check check(amount_sats>=546);
alter table orum_finance.bitcoin_jobs_v1 drop constraint if exists bitcoin_jobs_v1_fee_sats_check;
alter table orum_finance.bitcoin_jobs_v1 add constraint bitcoin_jobs_v1_fee_sats_check check(fee_sats>=1);

create or replace function public.ora_btc_claim_v1(p_id uuid,p_amount text,p_fee text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $fn$
declare prior jsonb;
begin
 if p_id is null or p_amount is null or p_fee is null or p_amount !~ '^[1-9][0-9]*$' or p_fee !~ '^[1-9][0-9]*$' then raise exception 'Invalid request'; end if;
 if p_amount::bigint<546 or p_fee::bigint<1 then raise exception 'Amount or fee below network minimum'; end if;
 perform pg_advisory_xact_lock(0,20260912);
 prior:=public.ora_btc_job_v1(p_id);
 if prior is not null then return jsonb_build_object('claimed',false,'reason',case when prior->>'amount_sats'=p_amount then 'already_reserved' else 'idempotency_conflict' end,'job',prior); end if;
 if exists(select 1 from orum_finance.bitcoin_jobs_v1 where status<>'confirmed') then return jsonb_build_object('claimed',false,'reason','another_payment_unresolved'); end if;
 insert into orum_finance.bitcoin_jobs_v1(id,amount_sats,fee_sats,status) values(p_id,p_amount::bigint,p_fee::bigint,'reserved');
 return jsonb_build_object('claimed',true);
end;
$fn$;
