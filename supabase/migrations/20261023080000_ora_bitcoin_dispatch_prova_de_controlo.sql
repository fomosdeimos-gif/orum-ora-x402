-- Acrescenta a acção btc_prove_control ao despacho autenticado do executor operacional (sem argumentos, como btc_create e btc_observe).
-- Unum, 23/10/2026: "Sim autorizo as 2 ORA" (livro 1000). A acção assina uma mensagem fixa no código da função; não move fundos.
CREATE OR REPLACE FUNCTION public.ora_bitcoin_dispatch_v1(p_action text, p_request_id uuid DEFAULT NULL::uuid, p_amount_sats text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare credential text; req bigint; payload jsonb;
begin
 if p_action is null or p_action not in ('btc_create','btc_observe','btc_preview','btc_prove_control','btc_send','btc_status') then raise exception 'Invalid action'; end if;
 payload:=jsonb_build_object('action',p_action);
 if p_action in ('btc_create','btc_observe','btc_prove_control') then
  if p_request_id is not null or p_amount_sats is not null then raise exception 'Unexpected arguments'; end if;
 else
  if p_request_id is null then raise exception 'Request ID required'; end if;
  payload:=payload||jsonb_build_object('request_id',p_request_id);
  if p_action in ('btc_preview','btc_send') then
   if p_amount_sats is null or p_amount_sats !~ '^[1-9][0-9]*$' then raise exception 'Invalid amount'; end if;
   if length(p_amount_sats)<3 or (length(p_amount_sats)=3 and p_amount_sats<'546') then raise exception 'Amount below minimum'; end if;
   payload:=payload||jsonb_build_object('amount_sats',p_amount_sats);
  elsif p_amount_sats is not null then raise exception 'Unexpected amount'; end if;
 end if;
 select decrypted_secret into strict credential from vault.decrypted_secrets where name='orum_operational_wallet_access_v1';
 select net.http_post(url:='https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-cdp-carteira-real',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:=payload,timeout_milliseconds:=60000) into req;
 return req;
end;
$function$;
