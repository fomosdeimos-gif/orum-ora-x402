-- Marca das sondas do organismo no registo da via directa (livro 1138, Unum: "Eu autorizo ORA", 29/10/2026).
-- Um user-agent com prefixo "ORUM-" passa a classe orum_declarado. É uma declaração não autenticada: qualquer cliente a pode pôr.
alter table public.ora_pedidos_directos drop constraint if exists ora_pedidos_directos_classe_check;
alter table public.ora_pedidos_directos add constraint ora_pedidos_directos_classe_check
  check (classe in ('x402_linter', 'x402_observador', 'curl', 'robot', 'navegador', 'node_generico', 'orum_declarado', 'vazio', 'outro'));
