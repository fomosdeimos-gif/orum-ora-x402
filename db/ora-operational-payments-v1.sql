-- One fixed-source/fixed-beneficiary Base USDC executor. No native BTC signer.
create schema orum_finance;
revoke all on schema orum_finance from public,anon,authenticated;
create table orum_finance.payment_jobs_v1 (
 id uuid primary key,
 amount_atomic bigint not null check(amount_atomic between 1 and 1000000),
 status text not null check(status in ('reserved','submitted','unknown','confirmed','reverted')),
 tx_hash text check(tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
alter table orum_finance.payment_jobs_v1 enable row level security;
revoke all on orum_finance.payment_jobs_v1 from public,anon,authenticated,service_role;

create function public.ora_payment_job_v1(p_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $fn$
 select jsonb_build_object('id',id,'amount_atomic',amount_atomic::text,'status',status,'tx_hash',tx_hash,'created_at',created_at,'updated_at',updated_at)
 from orum_finance.payment_jobs_v1 where id=p_id;
$fn$;

create function public.ora_payment_claim_v1(p_id uuid,p_amount text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $fn$
declare prior jsonb; total bigint; day_start timestamptz;
begin
 if p_id is null or p_amount is null or p_amount !~ '^[1-9][0-9]{0,6}$' then raise exception 'Invalid payment' using errcode='22023'; end if;
 if p_amount::bigint>1000000 then raise exception 'Per-payment cap exceeded' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(8453,20260910);
 prior:=public.ora_payment_job_v1(p_id);
 if prior is not null then return jsonb_build_object('claimed',false,'reason',case when prior->>'amount_atomic'=p_amount then 'already_reserved' else 'idempotency_conflict' end,'job',prior); end if;
 if exists(select 1 from orum_finance.payment_jobs_v1 where status in ('reserved','submitted','unknown')) then return jsonb_build_object('claimed',false,'reason','another_payment_unresolved'); end if;
 day_start:=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
 select coalesce(sum(amount_atomic),0) into total from orum_finance.payment_jobs_v1 where created_at>=day_start;
 if total+p_amount::bigint>5000000 then return jsonb_build_object('claimed',false,'reason','daily_cap_exceeded'); end if;
 insert into orum_finance.payment_jobs_v1(id,amount_atomic,status) values(p_id,p_amount::bigint,'reserved');
 return jsonb_build_object('claimed',true,'job',public.ora_payment_job_v1(p_id));
end;
$fn$;

create function public.ora_payment_result_v1(p_id uuid,p_status text,p_tx text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $fn$
declare prior orum_finance.payment_jobs_v1%rowtype;
begin
 select * into strict prior from orum_finance.payment_jobs_v1 where id=p_id for update;
 if p_status is null or p_status not in ('submitted','unknown','confirmed','reverted') then raise exception 'Invalid result'; end if;
 if p_tx is not null and p_tx !~ '^0x[0-9a-fA-F]{64}$' then raise exception 'Invalid transaction hash'; end if;
 if p_status<>'unknown' and p_tx is null then raise exception 'Transaction hash required'; end if;
 if prior.tx_hash is not null and p_tx is distinct from prior.tx_hash then raise exception 'Transaction hash conflict'; end if;
 if prior.status=p_status and prior.tx_hash is not distinct from p_tx then return public.ora_payment_job_v1(p_id); end if;
 if not ((prior.status='reserved' and p_status in ('submitted','unknown')) or (prior.status='submitted' and p_status in ('confirmed','reverted'))) then raise exception 'Invalid payment transition'; end if;
 update orum_finance.payment_jobs_v1 set status=p_status,tx_hash=p_tx,updated_at=clock_timestamp() where id=p_id;
 return public.ora_payment_job_v1(p_id);
end;
$fn$;
revoke all on function public.ora_payment_job_v1(uuid),public.ora_payment_claim_v1(uuid,text),public.ora_payment_result_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ora_payment_job_v1(uuid),public.ora_payment_claim_v1(uuid,text),public.ora_payment_result_v1(uuid,text,text) to service_role;

create function public.ora_operational_payment_dispatch_v1(p_action text,p_request_id uuid default null,p_amount_atomic text default null) returns bigint
language plpgsql security invoker set search_path=pg_catalog as $fn$
declare credential text; request_id bigint; payload jsonb;
begin
 if p_action is null or p_action not in ('receive_btc','preview_usdc','transfer_usdc','payment_status') then raise exception 'Invalid action'; end if;
 if p_action='receive_btc' then
  if p_request_id is not null or p_amount_atomic is not null then raise exception 'Unexpected arguments'; end if;
  payload:=jsonb_build_object('action',p_action);
 else
  if p_request_id is null then raise exception 'Request ID required'; end if;
  payload:=jsonb_build_object('action',p_action,'request_id',p_request_id);
  if p_action in ('preview_usdc','transfer_usdc') then
   if p_amount_atomic is null or p_amount_atomic !~ '^[1-9][0-9]{0,6}$' then raise exception 'Invalid amount'; end if;
   if p_amount_atomic::bigint>1000000 then raise exception 'Per-payment cap exceeded'; end if;
   payload:=payload||jsonb_build_object('amount_atomic',p_amount_atomic);
  elsif p_amount_atomic is not null then raise exception 'Unexpected amount'; end if;
 end if;
 select decrypted_secret into strict credential from vault.decrypted_secrets where name='orum_operational_wallet_access_v1';
 select net.http_post(url:='https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-cdp-carteira-real',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:=payload,timeout_milliseconds:=30000) into request_id;
 return request_id;
end;
$fn$;
revoke all on function public.ora_operational_payment_dispatch_v1(text,uuid,text) from public,anon,authenticated;
