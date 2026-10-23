-- 23/10/2026 (livro 998). O gatilho notify_verified_payment punha SEMPRE o titulo "Novo sustento confirmado" e so dizia
-- a origem no corpo ("... origem interno"): o pagamento de teste de 22/10 (evento 333) ficou como "sustento" no titulo.
-- So receita externa confirmada e sustento (economia/constituicao-v2.json). O titulo passa a seguir a classificacao do pagador.
-- O corpo, o destino, a fila e a deduplicacao ficam exactamente como estavam.
-- Provado a 23/10/2026 numa transaccao revertida: pagador interno => "Pagamento interno (validação, não é sustento)";
-- pagador desconhecido => "Entrada por classificar (ainda não é sustento)". Nenhuma linha de teste ficou.
create or replace function orum_private.notify_verified_payment()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'orum_private'
as $function$
declare amount_usdc text; classification text; titulo text;
begin
  if new.status is distinct from 'verificado_onchain' or new.chain_id is distinct from 8453
     or lower(coalesce(new.destino,'')) <> lower('0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5')
     or upper(coalesce(new.currency,'')) <> 'USDC' then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from 'verificado_onchain' then return new; end if;
  amount_usdc := case when coalesce(new.amount,'') ~ '^[0-9]+$'
    then trim(to_char(new.amount::numeric/1000000,'FM999999990.000000')) else coalesce(new.amount,'?') end;
  select coalesce(c.classificacao,'desconhecido') into classification
  from (select 1) x left join public.ora_carteiras_classificacao c on lower(c.endereco)=lower(new.payer) limit 1;
  titulo := case classification
    when 'externo' then 'Novo sustento confirmado'
    when 'interno' then 'Pagamento interno (validação, não é sustento)'
    else 'Entrada por classificar (ainda não é sustento)' end;
  perform orum_private.enqueue_push_event(
    'sustento',coalesce(new.tx_hash,new.id::text),titulo,
    left(amount_usdc || ' USDC na Base · origem ' || replace(classification,'_',' '),180),
    '/organismo.html','orum-sustento-' || new.id::text
  );
  return new;
end;
$function$;
