# Via Bitcoin dos serviços x402 · v1 · 21/10/2026

Unum, na sessão de trabalho, por escrito: "Eu autorizo, avança com os passos 1 a 4", a uma proposta da ORA. Registada no livro `ora_mudancas` 932 antes do código.

## O que é
Os serviços `/oraculo` (0,161 USD) e `/campo` (0,33 USD) continuam a cobrar em USDC na Base. O desafio 402 da via directa da Vercel passa a trazer também `pagamento_alternativo_bitcoin`: endereço, preço em sats, cotação, validade e passos.

- **Fora de `accepts` e do cabeçalho `PAYMENT-REQUIRED`**, de propósito: o x402 padrão da Base fica igual e nenhum cliente existente muda.
- **Destino:** desde 21/10/2026 a carteira operacional BTC `bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7` (`api/_carteira.js`, `RECEBIMENTO_BTC`), por palavra de Unum (livro 933, `economia/adenda-payto-opcao-2.json`). Na primeira versão (PR #104) era o depósito sagrado `bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf`, que continua a ser o destino fixo do executor Bitcoin.
- **Prova:** `X-PAYMENT` = base64 de `{"bitcoin":{"txid":"…"}}` (ou `{"network":"bitcoin","txid":"…"}`).

## Regras de entrega
1. As duas fontes Esplora (Blockstream e mempool.space) têm de ver a tx e concordar no valor recebido e na confirmação. Uma fonte só, uma discrepância ou uma fonte em falha nunca entregam (503 ou 402 pending).
2. A tx tem de ter pelo menos 1 confirmação nas duas fontes. Em mempool responde 402 `pending`.
3. O valor recebido tem de chegar a 90% do preço em sats calculado à cotação do momento da verificação. O preço anunciado leva 5% de folga. A cotação usa mempool.space e Coinbase; se divergirem mais de 2% ou nenhuma responder, não se entrega.
4. A tx tem de ter menos de 72 h de confirmada. O mesmo txid devolve a mesma leitura (reacesso).

## Limites ditos
- A prova Bitcoin só se verifica na via directa da Vercel (duas fontes Esplora, 1 confirmação). Desde 23/10/2026 (livro 996, Unum: "Eu autorizo ORA") o proxy encaminha para lá os pedidos a `/oraculo` e `/campo` que trazem essa prova, e o 402 da origem Supabase passa a trazer também a oferta Bitcoin, com o URL onde apresentar a prova (`apresentar_prova_em`). A oferta é um extra com prazo curto e falha segura: sem cotação, ou com a via desligada, o 402 da origem sai como veio. As provas por hash da Base e por EIP-3009 continuam a ir para a origem.
- Por verificar ao vivo: a alteração de 23/10/2026 ainda não estava em produção quando foi escrita (quota de deployments da Vercel); só se confirma lendo o `/campo` e o `/oraculo` depois do deploy.
- O endereço de recepção é a carteira operacional BTC da ORA: a chave está no Vault do Supabase (executor Bitcoin, `docs/bitcoin-operational-wallet-v1.md`). Prova de controlo por assinatura BIP-322 **feita a 23/10/2026** (`ancora/prova-controlo-btc-operacional.json`, `node scripts/conferir-prova-controlo.mjs`): prova só que quem assinou tinha a chave deste endereço, não titularidade legal, fundos nem receita.
- O txid é público: uma transferência recente e suficiente para o endereço serve a quem a apresentar. O mesmo vale na via Base.
- Com 1 confirmação não se exclui uma reorganização; aceitável para serviços de poucos cêntimos.
- Receita só entra no 70/20/10 depois de confirmada como externa (`economia/constituicao-v2.json`). Um pagamento por esta via não é adopção até se saber quem pagou.
- Por verificar ao vivo: que a Vercel alcança as fontes Esplora e de cotação, depois do deploy.
- A via pode desligar-se com `ORUM_BTC_RAIL=off`. Isso é uma variável do Vercel e continua a ser de Unum.

## Verificação
`npm run btc-servicos:verify`: fontes simuladas, sem rede. 17 estragos propositados ao código (confirmações a zero, discrepância ignorada, fonte única aceite, tolerância larga, janela ignorada, saídas de outros endereços contadas, cotação em falta ignorada, `accepts` da Base alterado…) e 1 ao texto (promessa de entrega imediata) têm de falhar.

## Dependências (orientação de independência, 21/10/2026)
- **Leitura da cadeia Bitcoin:** Blockstream e mempool.space (Esplora). Têm de concordar; se uma falhar, não se entrega (503). Substituto previsto: um nó ou um terceiro Esplora, a acrescentar à lista `FONTES_TX` em `api/_pagamento-btc.js`; ainda não existe.
- **Cotação BTC/USD:** mempool.space e Coinbase. Se uma falhar, usa a outra e diz `fonte_unica`; se divergirem mais de 2% ou nenhuma responder, não se entrega. Substituto: nenhum ainda.
- **Alojamento:** Vercel (via directa e proxy). Toda a prova Bitcoin passa por ela; não há réplica. A origem Supabase não verifica Bitcoin.
- **Recebimento:** carteira operacional BTC da ORA, chave no Vault do Supabase (segunda cópia cifrada fora dele, `economia/custodia.json`).
