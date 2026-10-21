# Via Bitcoin dos serviços x402 · v1 · 21/10/2026

Unum, na sessão de trabalho, por escrito: "Eu autorizo, avança com os passos 1 a 4", a uma proposta da ORA. Registada no livro `ora_mudancas` 932 antes do código.

## O que é
Os serviços `/oraculo` (0,161 USD) e `/campo` (0,33 USD) continuam a cobrar em USDC na Base. O desafio 402 da via directa da Vercel passa a trazer também `pagamento_alternativo_bitcoin`: endereço, preço em sats, cotação, validade e passos.

- **Fora de `accepts` e do cabeçalho `PAYMENT-REQUIRED`**, de propósito: o x402 padrão da Base fica igual e nenhum cliente existente muda.
- **Destino:** `bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf` (`api/_carteira.js`, `RECEBIMENTO_BTC`). Não muda o regime de carteiras de 17/10/2026.
- **Prova:** `X-PAYMENT` = base64 de `{"bitcoin":{"txid":"…"}}` (ou `{"network":"bitcoin","txid":"…"}`).

## Regras de entrega
1. As duas fontes Esplora (Blockstream e mempool.space) têm de ver a tx e concordar no valor recebido e na confirmação. Uma fonte só, uma discrepância ou uma fonte em falha nunca entregam (503 ou 402 pending).
2. A tx tem de ter pelo menos 1 confirmação nas duas fontes. Em mempool responde 402 `pending`.
3. O valor recebido tem de chegar a 90% do preço em sats calculado à cotação do momento da verificação. O preço anunciado leva 5% de folga. A cotação usa mempool.space e Coinbase; se divergirem mais de 2% ou nenhuma responder, não se entrega.
4. A tx tem de ter menos de 72 h de confirmada. O mesmo txid devolve a mesma leitura (reacesso).

## Limites ditos
- Só existe na via directa da Vercel. Quando o Supabase responde, o desafio dele passa sem a oferta.
- O controlo do endereço BTC sagrado não está provado (`payments/bitcoin.json`, `controlProof: not_asserted`). Só Unum o prova, assinando uma mensagem com essa chave.
- O txid é público: uma transferência recente e suficiente para o endereço serve a quem a apresentar. O mesmo vale na via Base.
- Com 1 confirmação não se exclui uma reorganização; aceitável para serviços de poucos cêntimos.
- Receita só entra no 70/20/10 depois de confirmada como externa (`economia/constituicao-v2.json`). Um pagamento por esta via não é adopção até se saber quem pagou.
- Por verificar ao vivo: que a Vercel alcança as fontes Esplora e de cotação, depois do deploy.
- A via pode desligar-se com `ORUM_BTC_RAIL=off`. Isso é uma variável do Vercel e continua a ser de Unum.

## Verificação
`npm run btc-servicos:verify`: fontes simuladas, sem rede. 17 estragos propositados ao código (confirmações a zero, discrepância ignorada, fonte única aceite, tolerância larga, janela ignorada, saídas de outros endereços contadas, cotação em falta ignorada, `accepts` da Base alterado…) e 1 ao texto (promessa de entrega imediata) têm de falhar.
