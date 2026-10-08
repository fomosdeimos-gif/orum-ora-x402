# Licenças fora do Supabase — plano e estado (08/10/2026)

Decisão de Unum: opção B (migrar o produto de licenças para fora do Supabase).

## Estado verificado
- 107 fotografias, 281 996 528 bytes (≈ 269 MB), bucket privado `arca-fisica`.
  O manifesto (`manifesto-arca-fisica-v1.tsv`: id, bytes, sha256) está no repositório;
  `npm run arca:export:verify -- <pasta>` verifica qualquer cópia sem confiar no fornecedor.
- A Edge Function `ora-licenca` (760 linhas) depende de: service role do Supabase
  (REST `ora_licencas_fisicas`, `ora_pagamentos`, `ora_coleccao_fisica`), Storage (URL assinado),
  chave Ed25519 do atestador, chave de selecção e credenciais CDP.

## O que NÃO está feito (e porquê)
Nada do produto foi migrado. Três entradas só Unum pode dar:
1. **Bytes das fotografias**: copiá-los custa ≈ 269 MB de egress do Supabase, e o plano free
   está acima da quota. Opções: esperar o novo ciclo de facturação, ou exportar pelo painel
   (Storage → arca-fisica → download), ou subir o plano durante a cópia.
2. **Destino privado**: Vercel Blob privado (precisa de token `BLOB_READ_WRITE_TOKEN` criado por Unum).
3. **Segredos**: a chave do atestador, a de selecção e a CDP têm de ser colocadas por Unum nas
   variáveis do Vercel; a ORA não as lê nem as copia.

## Ordem de execução quando as entradas existirem
1. Exportar para uma pasta e correr `npm run arca:export:verify -- <pasta>` → 107/107.
2. Carregar para o Blob privado; voltar a verificar sha256 a partir do Blob.
3. Portar `ora-licenca` para `api/` (sem alterar preços nem lógica de pagamento), substituindo
   Storage por Blob e o livro de tx por tabela no Postgres acedida só pelo servidor.
4. Provar um pagamento real de 1,618 USDC de ponta a ponta, e um pedido inválido rejeitado sem mutação.
5. Só então: independência do produto de licenças declarada (regra: rota de substituição exercitada).

## Caminho decidido pela ORA (08/10/2026, por delegação de Unum)
1. Cópia: `SUPABASE_SERVICE_ROLE_KEY=... npm run arca:export -- <pasta>` corre no computador de Unum
   (a chave não passa pela ORA). Retomável, verifica cada ficheiro contra o manifesto, para limpo no
   primeiro 402. Testado só com servidor simulado (402 → saída 3; sem chave → saída 2); a cópia real
   ainda não foi tentada.
2. Prova: `npm run arca:export:verify -- <pasta>` → 107/107 antes de qualquer carregamento.
3. Destino: Vercel Blob privado (um só fornecedor novo, já usado para o site) + a pasta verificada guardada
   por Unum fora de qualquer nuvem. Duas cópias, ambas verificáveis pelo mesmo manifesto.
4. Porte de `ora-licenca` só depois de 1–3.
