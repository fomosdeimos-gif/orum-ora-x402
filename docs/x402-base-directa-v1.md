# O 402 da Base pela via directa · v1 · 25/10/2026

Unum, na sessão de trabalho, por escrito: "Eu autorizo ORA", à proposta concreta da ORA de pôr a via directa primeiro no 402 da Base (livro 1022, registado antes do código). A palavra tem este objecto e nenhum outro.

## O que a ORA leu (verificado, 25/10/2026)
- A cláusula de 21/10/2026 (livro 933) pôs a operacional como `payTo` da Base na via directa da Vercel (`api/_carteira.js`, `RECEBIMENTO`). O texto assumia que, com o Supabase fora de quota, quem serve é a via directa.
- Não era assim. `api/proxy.js` pedia primeiro à origem Supabase e só usava a via directa se a origem desse 5xx, um 402 sem desafio válido ou se o pedido trouxesse prova Bitcoin. A origem continuou a responder com um 402 válido, e esse passava tal e qual, com o `payTo` implantado lá: a sagrada antiga. Lido em produção a 22, 23, 24 e 25/10/2026 pela sonda diária (`economia/sonda-pagamento.json`) e pelos cabeçalhos `x-ora-version` e `x-ora-tier` (da origem), ao lado de `x-ora-bazaar` e `x-ora-btc` (acrescentados pelo gateway).
- Consequência: quem pagasse em USDC na Base a `/oraculo` ou `/campo` pagava à sagrada antiga, não à operacional. Erro da leitura de 21/10/2026, corrigido aqui.

## O que muda
Em `api/proxy.js`, para `/oraculo` e `/campo` (só estes dois serviços):
1. **Sem prova**, e se o facilitador estiver pronto (`directo.eipPronto()`: CDP configurado, ou facilitador público que anuncia a Base mainnet com `exact` v2): o desafio 402 sai da via directa, com a operacional como `payTo`. Sem facilitador pronto, fica como estava (origem): a via EIP-3009 é a do x402 padrão e não se tira a quem a usa.
2. **Autorização EIP-3009 dirigida à operacional** (`authorization.to`): vai para a via directa. As dirigidas a outro endereço seguem para a origem.
3. **Prova por hash**: tenta primeiro a origem (como antes). Se a origem responde 402 que não seja `pending`, a via directa confere o hash na Base (transferência de USDC para a operacional). Um `pending` da origem fica como está. Um 200 da origem passa como estava.
4. **Prova Bitcoin**: como desde 23/10/2026 (livro 996), via directa.
5. **`ORUM_BASE_VIA=origem`** repõe o comportamento anterior em tudo (3 e 4 e 1 e 2). É uma variável do Vercel e continua a ser de Unum.

## O que não muda
Destino dos 70% (sagrada antiga, executor v13), funções de borda do Supabase (`RECEBIMENTO_EDGE`), textos públicos e listagens que ainda anunciam a sagrada antiga (mudá-las é contacto externo em nome de Unum), preços, regras de entrega e a via Bitcoin. Não move fundos.

## Limites ditos (não verificado)
- Que o facilitador público liquide de facto uma autorização EIP-3009 na Base mainnet: só anuncia em `/supported`. Nunca houve pagamento externo por esta via. Se a liquidação falhar, o cliente recebe um erro e nenhuma transferência acontece; não se perde fundos, perde-se a venda.
- Que a declaração Bazaar do desafio da via directa seja aceite como a da origem (`api/_bazaar-declaracao.js` só trabalha sobre o 402 da origem). A via directa traz `extensions` próprias (`bazaarExtension`); a equivalência com o catálogo não foi lida.
- Que a Vercel alcance o RPC da Base e o facilitador em produção: só se confirma depois do deploy, lendo `/oraculo` e `/campo` (`x-ora-via: vercel-directa` e `payTo` da operacional).
- Pagamentos feitos à sagrada antiga a partir de um desafio antigo continuam a ser aceites pela origem (prova por hash). Cada pagamento é externo só depois de Unum o classificar (`economia/constituicao-v2.json`); receita externa confirmada: nenhuma.

## Dependências (orientação de independência)
Alojamento: Vercel (proxy e via directa). Leitura da Base: quatro RPC públicos em sequência (`api/_x402-directo.js`). Liquidação: CDP, se configurado, ou facilitador público (`payai`, `mogami`) que anuncie a Base. Se todos falharem, o desafio volta à origem (sem facilitador) e os hashes continuam a conferir-se na cadeia.

## Verificação
`npm run base-directa:verify`: origem, facilitador e RPC simulados, sem rede; 10 estragos ao código e 3 ao texto apanhados.
