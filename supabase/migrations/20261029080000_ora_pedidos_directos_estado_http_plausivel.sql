-- Endurece a RPC ora_registar_pedido_directo (livro 1109): a escrita aberta recebeu 112 linhas com estado_http entre 290 e 299
-- (27/10 22:19 a 28/10 07:21 UTC), que não são estados HTTP que o proxy devolva; vieram de quem chamou a RPC, não do proxy.
-- A função passa a recusar qualquer estado fora da lista que o proxy pode devolver. As linhas já escritas não se apagam (a tabela só acumula).
create or replace function public.ora_registar_pedido_directo(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.ora_pedidos_directos where created_at > now() - interval '1 minute') >= 300 then
    return;
  end if;
  begin
    if (p->>'estado_http')::integer not in (200, 204, 301, 302, 307, 308, 400, 401, 402, 403, 404, 405, 409, 410, 413, 429, 500, 502, 503, 504) then
      return;
    end if;
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
    return;
  end;
end;
$$;
revoke all on function public.ora_registar_pedido_directo(jsonb) from public;
grant execute on function public.ora_registar_pedido_directo(jsonb) to anon, authenticated, service_role;
