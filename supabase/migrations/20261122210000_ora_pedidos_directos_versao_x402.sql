-- Versao do X-PAYMENT no registo da via directa (22/11/2026, Unum: "Eu autorizo ora"). Alarga o CHECK de tipo_prova com
-- eip3009_v1 e eip3009_v2 (versao do envelope x402); 'eip3009' fica para a versao ausente. Aditivo: nada existente deixa de caber.
-- Sem coluna nova, sem guardar a prova, sem dados pessoais. A RPC ora_registar_pedido_directo nao muda (copia tipo_prova tal como vem).
alter table public.ora_pedidos_directos drop constraint if exists ora_pedidos_directos_tipo_prova_check;
alter table public.ora_pedidos_directos add constraint ora_pedidos_directos_tipo_prova_check
  check (tipo_prova in ('btc', 'eip3009', 'eip3009_v1', 'eip3009_v2', 'tx', 'invalida'));
