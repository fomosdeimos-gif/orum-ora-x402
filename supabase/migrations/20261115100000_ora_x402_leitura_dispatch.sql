-- Despacho fixo da acção x402_pagar_leitura do executor operacional (15/11/2026).
-- Unum: "Eu autorizo ora", ao texto concreto da acção (valor fixo 10 000 átomos de USDC da operacional para ela própria, URL e modelo fixos).
-- Função nova; nenhum despachante existente é alterado. Só leva um request_id; valor, destino e URL vivem no código do executor.
CREATE OR REPLACE FUNCTION public.ora_x402_leitura_dispatch_v1(p_request_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare credential text; req bigint;
begin
 if p_request_id is null then raise exception 'Request ID required'; end if;
 select decrypted_secret into strict credential from vault.decrypted_secrets where name='orum_operational_wallet_access_v1';
 select net.http_post(url:='https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-cdp-carteira-real',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:=jsonb_build_object('action','x402_pagar_leitura','request_id',p_request_id),timeout_milliseconds:=60000) into req;
 return req;
end;
$function$;
REVOKE ALL ON FUNCTION public.ora_x402_leitura_dispatch_v1(uuid) FROM PUBLIC, anon, authenticated;
