-- Pedidos às rotas pagas (/oraculo, /campo e as suas amostras /eco) vistos pelo proxy do Vercel, qualquer que seja a via que serve (livro 1106).
-- Fecha o ponto cego dito em economia/pedidos-aos-servicos.json: a via directa não ficava registada em lado nenhum.
-- Sem dados pessoais: não guarda IP, user-agent em bruto, endereço de pagador nem hash de origem; só rota, método, via, estado HTTP,
-- classe de máquina (do user-agent, sem o guardar) e o tipo de prova de pagamento. A escrita é aberta (chave pública pela função abaixo),
-- por isso é um relato não autenticado: serve para medir, nunca como prova de pagamento, procura ou receita.
create table if not exists public.ora_pedidos_directos (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  rota text not null check (rota in ('/oraculo', '/campo', '/oraculo/eco', '/campo/eco')),
  metodo text not null check (metodo in ('GET', 'HEAD', 'POST')),
  via text not null check (via in ('vercel-directa', 'origem', 'snapshot')),
  estado_http integer not null check (estado_http between 100 and 599),
  sinal_pagamento boolean not null,
  tipo_prova text check (tipo_prova in ('btc', 'eip3009', 'tx', 'invalida')),
  classe text not null check (classe in ('x402_linter', 'x402_observador', 'curl', 'robot', 'navegador', 'node_generico', 'vazio', 'outro')),
  fonte text not null default 'proxy-vercel; relato não autenticado'
);
create index if not exists ora_pedidos_directos_created_at_idx on public.ora_pedidos_directos (created_at);
alter table public.ora_pedidos_directos enable row level security;
revoke all on table public.ora_pedidos_directos from anon, authenticated;

create or replace function public.ora_registar_pedido_directo(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- tecto de escrita: no máximo 300 linhas por minuto, para a escrita aberta não encher a tabela
  if (select count(*) from public.ora_pedidos_directos where created_at > now() - interval '1 minute') >= 300 then
    return;
  end if;
  begin
    insert into public.ora_pedidos_directos (rota, metodo, via, estado_http, sinal_pagamento, tipo_prova, classe)
    values (
      p->>'rota',
      p->>'metodo',
      p->>'via',
      (p->>'estado_http')::integer,
      coalesce((p->>'sinal_pagamento')::boolean, false),
      nullif(p->>'tipo_prova', ''),
      p->>'classe'
    );
  exception when others then
    return; -- valores fora da lista são descartados em silêncio
  end;
end;
$$;
revoke all on function public.ora_registar_pedido_directo(jsonb) from public;
grant execute on function public.ora_registar_pedido_directo(jsonb) to anon, authenticated, service_role;
