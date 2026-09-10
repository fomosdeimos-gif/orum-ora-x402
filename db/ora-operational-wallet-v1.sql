-- Authenticated operational-wallet route; credentials never returned to the caller.
do $init$
begin
 if not exists(select 1 from vault.secrets where name='orum_operational_wallet_access_v1') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'orum_operational_wallet_access_v1','Internal caller authentication for ora-operational-wallet v1 only');
 end if;
end;
$init$;
create function public.ora_operational_wallet_auth_v1(p_token text) returns boolean
language sql stable security definer set search_path=pg_catalog
as $fn$ select length(p_token)=64 and exists(select 1 from vault.decrypted_secrets where name='orum_operational_wallet_access_v1' and decrypted_secret=p_token); $fn$;
revoke all on function public.ora_operational_wallet_auth_v1(text) from public,anon,authenticated;
grant execute on function public.ora_operational_wallet_auth_v1(text) to service_role;
create function public.ora_operational_wallet_dispatch_v1(p_action text default 'observe') returns bigint
language plpgsql security invoker set search_path=pg_catalog
as $fn$
declare credential text; request_id bigint;
begin
 if p_action not in ('create','observe') or p_action is null then raise exception 'Allowed actions: create, observe' using errcode='22023'; end if;
 select decrypted_secret into strict credential from vault.decrypted_secrets where name='orum_operational_wallet_access_v1';
 select net.http_post(url:='https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-operational-wallet',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),
  body:=jsonb_build_object('action',p_action),timeout_milliseconds:=30000) into request_id;
 return request_id;
end;
$fn$;
revoke all on function public.ora_operational_wallet_dispatch_v1(text) from public,anon,authenticated;
-- Called by the already authenticated administrative SQL connector. No new public financial route.

