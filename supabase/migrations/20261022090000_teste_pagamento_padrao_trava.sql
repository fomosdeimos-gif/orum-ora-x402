-- Trava de execução única do executor de pagamento de teste (ora-cdp-agente-teste v2).
-- Autorização de Unum, 21/10/2026: "Eu autorizo ORA" (livro ora_mudancas 943).
-- A função insere a chave 'v1' ANTES de assinar nada; se já existir (409), recusa.
-- Só a service role escreve (RLS ligada, sem políticas). Repetir exige apagar a linha de propósito.
create table if not exists public.ora_teste_pagamento_padrao (
  chave text primary key,
  criado_em timestamptz not null default now(),
  estado text not null default 'iniciado',
  tx_hash text,
  detalhe jsonb
);
alter table public.ora_teste_pagamento_padrao enable row level security;
