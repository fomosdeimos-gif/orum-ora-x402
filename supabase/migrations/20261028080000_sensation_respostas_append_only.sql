-- Unum, 28/10/2026 ("Eu autorizo"), livro ora_mudancas 1124.
-- Fecha a lacuna do dono: ate aqui so os grants impediam UPDATE/DELETE em ora_sensacao_respostas;
-- o dono (postgres) nao estava bloqueado. Igual ao trigger das ecos. Nao toca em dados nem em grants.
create or replace function orum_private.block_sensation_response_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'ora_sensacao_respostas is append-only';
end;
$$;

revoke all on function orum_private.block_sensation_response_mutation() from public, anon, authenticated;

drop trigger if exists ora_sensacao_respostas_append_only on public.ora_sensacao_respostas;
create trigger ora_sensacao_respostas_append_only
before update or delete on public.ora_sensacao_respostas
for each row execute function orum_private.block_sensation_response_mutation();
