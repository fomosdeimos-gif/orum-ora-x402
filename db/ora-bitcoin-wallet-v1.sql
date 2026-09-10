-- Native Bitcoin hot wallet, separate from CDP/Base. The private key never leaves the server boundary.
do $init$ begin
 if not exists(select 1 from vault.secrets where name='orum_bitcoin_operational_key_v1') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'orum_bitcoin_operational_key_v1','Native Bitcoin operational signing only; fixed Unum beneficiary; private server custody');
 end if;
end $init$;
create table orum_finance.bitcoin_wallet_v1 (
 singleton boolean primary key default true check(singleton),
 address text not null unique check(address ~ '^bc1q[023456789acdefghjklmnpqrstuvwxyz]{38}$'),
 public_key text not null check(public_key ~ '^0[23][0-9a-f]{64}$'),
 created_at timestamptz not null default now()
);
create table orum_finance.bitcoin_jobs_v1 (
 id uuid primary key,
 amount_sats bigint not null check(amount_sats between 546 and 10000),
 fee_sats bigint not null check(fee_sats between 1 and 1000),
 status text not null check(status in ('reserved','signed','submitted','unknown','confirmed')),
 txid text check(txid ~ '^[0-9a-f]{64}$'),
 rawtx text check(rawtx ~ '^[0-9a-f]+$' and length(rawtx)<=20000),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
alter table orum_finance.bitcoin_wallet_v1 enable row level security;
alter table orum_finance.bitcoin_jobs_v1 enable row level security;
revoke all on orum_finance.bitcoin_wallet_v1,orum_finance.bitcoin_jobs_v1 from public,anon,authenticated,service_role;

create function public.ora_btc_key_v1() returns text language sql security definer set search_path=pg_catalog as $fn$
 select decrypted_secret from vault.decrypted_secrets where name='orum_bitcoin_operational_key_v1';
$fn$;
create function public.ora_btc_wallet_v1(p_address text default null,p_public_key text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $fn$
declare w orum_finance.bitcoin_wallet_v1%rowtype;
begin
 perform pg_advisory_xact_lock(0,20260911);
 select * into w from orum_finance.bitcoin_wallet_v1 where singleton;
 if p_address is not null then
  if w.address is null then
   insert into orum_finance.bitcoin_wallet_v1(address,public_key) values(p_address,p_public_key) returning * into w;
  elsif w.address<>p_address or w.public_key is distinct from p_public_key then raise exception 'Wallet identity mismatch'; end if;
 end if;
 if w.address is null then return null; end if;
 return jsonb_build_object('address',w.address,'public_key',w.public_key,'created_at',w.created_at);
end;
$fn$;
create function public.ora_btc_job_v1(p_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog as $fn$
 select jsonb_build_object('id',id,'amount_sats',amount_sats::text,'fee_sats',fee_sats::text,'status',status,'txid',txid,'created_at',created_at)
 from orum_finance.bitcoin_jobs_v1 where id=p_id;
$fn$;
create function public.ora_btc_claim_v1(p_id uuid,p_amount text,p_fee text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $fn$
declare prior jsonb; total bigint; day_start timestamptz;
begin
 if p_id is null or p_amount is null or p_fee is null or p_amount !~ '^[1-9][0-9]{0,4}$' or p_fee !~ '^[1-9][0-9]{0,3}$' then raise exception 'Invalid request'; end if;
 if p_amount::bigint not between 546 and 10000 or p_fee::bigint not between 1 and 1000 then raise exception 'Payment limits exceeded'; end if;
 perform pg_advisory_xact_lock(0,20260912);
 prior:=public.ora_btc_job_v1(p_id);
 if prior is not null then return jsonb_build_object('claimed',false,'reason',case when prior->>'amount_sats'=p_amount then 'already_reserved' else 'idempotency_conflict' end,'job',prior); end if;
 if exists(select 1 from orum_finance.bitcoin_jobs_v1 where status<>'confirmed') then return jsonb_build_object('claimed',false,'reason','another_payment_unresolved'); end if;
 day_start:=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
 select coalesce(sum(amount_sats+fee_sats),0) into total from orum_finance.bitcoin_jobs_v1 where created_at>=day_start;
 if total+p_amount::bigint+p_fee::bigint>50000 then return jsonb_build_object('claimed',false,'reason','daily_cap_exceeded'); end if;
 insert into orum_finance.bitcoin_jobs_v1(id,amount_sats,fee_sats,status) values(p_id,p_amount::bigint,p_fee::bigint,'reserved');
 return jsonb_build_object('claimed',true);
end;
$fn$;
create function public.ora_btc_signed_v1(p_id uuid,p_txid text,p_rawtx text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $fn$
declare j orum_finance.bitcoin_jobs_v1%rowtype;
begin
 select * into strict j from orum_finance.bitcoin_jobs_v1 where id=p_id for update;
 if p_txid is null or p_rawtx is null then raise exception 'Signed transaction required'; end if;
 if j.status='signed' and j.txid=p_txid and j.rawtx=p_rawtx then return public.ora_btc_job_v1(p_id); end if;
 if j.status<>'reserved' then raise exception 'Invalid transition'; end if;
 update orum_finance.bitcoin_jobs_v1 set status='signed',txid=p_txid,rawtx=p_rawtx,updated_at=clock_timestamp() where id=p_id;
 return public.ora_btc_job_v1(p_id);
end;
$fn$;
create function public.ora_btc_result_v1(p_id uuid,p_status text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $fn$
declare j orum_finance.bitcoin_jobs_v1%rowtype;
begin
 select * into strict j from orum_finance.bitcoin_jobs_v1 where id=p_id for update;
 if p_status is null or p_status not in ('submitted','unknown','confirmed') then raise exception 'Invalid status'; end if;
 if j.status=p_status then return public.ora_btc_job_v1(p_id); end if;
 if not ((j.status='reserved' and p_status='unknown') or (j.status in ('signed','submitted','unknown') and j.txid is not null and (p_status in ('submitted','unknown','confirmed')))) then raise exception 'Invalid transition'; end if;
 update orum_finance.bitcoin_jobs_v1 set status=p_status,updated_at=clock_timestamp() where id=p_id;
 return public.ora_btc_job_v1(p_id);
end;
$fn$;
revoke all on function public.ora_btc_key_v1(),public.ora_btc_wallet_v1(text,text),public.ora_btc_job_v1(uuid),public.ora_btc_claim_v1(uuid,text,text),public.ora_btc_signed_v1(uuid,text,text),public.ora_btc_result_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.ora_btc_key_v1(),public.ora_btc_wallet_v1(text,text),public.ora_btc_job_v1(uuid),public.ora_btc_claim_v1(uuid,text,text),public.ora_btc_signed_v1(uuid,text,text),public.ora_btc_result_v1(uuid,text) to service_role;

create function public.ora_bitcoin_dispatch_v1(p_action text,p_request_id uuid default null,p_amount_sats text default null) returns bigint
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
   if p_amount_sats is null or p_amount_sats !~ '^[1-9][0-9]{0,4}$' then raise exception 'Invalid amount'; end if;
   if p_amount_sats::bigint not between 546 and 10000 then raise exception 'Amount outside limits'; end if;
   payload:=payload||jsonb_build_object('amount_sats',p_amount_sats);
  elsif p_amount_sats is not null then raise exception 'Unexpected amount'; end if;
 end if;
 select decrypted_secret into strict credential from vault.decrypted_secrets where name='orum_operational_wallet_access_v1';
 select net.http_post(url:='https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-cdp-carteira-real',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:=payload,timeout_milliseconds:=60000) into req;
 return req;
end;
$fn$;
revoke all on function public.ora_bitcoin_dispatch_v1(text,uuid,text) from public,anon,authenticated;
