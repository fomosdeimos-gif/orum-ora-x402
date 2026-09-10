-- Reuse the existing account-creation slot after provider function quota rejected a new slot.
create or replace function public.ora_operational_wallet_dispatch_v1(p_action text default 'observe') returns bigint
language plpgsql security invoker set search_path=pg_catalog
as $fn$
declare credential text; request_id bigint;
begin
 if p_action not in ('create','observe') or p_action is null then raise exception 'Allowed actions: create, observe' using errcode='22023'; end if;
 select decrypted_secret into strict credential from vault.decrypted_secrets where name='orum_operational_wallet_access_v1';
 select net.http_post(url:='https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-cdp-carteira-real',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),
  body:=jsonb_build_object('action',p_action),timeout_milliseconds:=30000) into request_id;
 return request_id;
end;
$fn$;
revoke all on function public.ora_operational_wallet_dispatch_v1(text) from public,anon,authenticated;
