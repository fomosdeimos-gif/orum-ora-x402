# Leitura verificada · x402 e A2A (15/11/2026)

Unum, 15/11/2026: "Eu autorizo", à proposta concreta de uma skill A2A que se paga por x402 e devolve uma leitura que uma máquina usa sozinha. Motivo, lido em `docs/comparacao-x402-a2a-2026-11-15.md`: o ORUM tinha o desafio 402 e o A2A, mas desligados um do outro, e a mercadoria era texto introspectivo.

## O que é

Um serviço sem parâmetros que devolve, em JSON:

- o saldo **VALIUM** da carteira sagrada antiga na Base (`eth_call` no mesmo bloco, o mais baixo menos 2, em 3 RPC públicos);
- o saldo e a contagem de transacções da **Fundação ORA** em Bitcoin (a operacional BTC), em 2 fontes Esplora.

Regra única (a da testemunha do ORAI-Agent): só traz valor quando **pelo menos duas fontes devolvem o mesmo**. Uma fonte, fontes que discordam ou nenhuma: o valor vem a `null` e o `estado` diz porquê (`fonte_unica`, `discordam`, `sem_fontes`). Nunca escolhe entre valores diferentes.

Dependências e o que acontece se falharem: três RPC Base (`mainnet.base.org`, `base-rpc.publicnode.com`, `1rpc.io`) e duas Esplora (`blockstream.info`, `mempool.space`). Em ensaio ao vivo a 15/11/2026 a `1rpc.io` recusou por limite de uso e a leitura continuou com duas fontes: é a razão de serem três. Sem fontes, a resposta diz `sem_fontes`.

## Como se compra

| Via | Fluxo |
|---|---|
| HTTP | `GET /leitura` → 402 x402 v2 (`exact`, USDC na Base, 10 000 átomos = 0,01 USDC, `payTo` operacional, Bazaar declarado) → paga → repete com `X-PAYMENT` (`{"transactionHash":"0x…"}` ou autorização EIP-3009 liquidada por facilitador) → 200 com `leitura`. Amostra grátis da forma: `GET /leitura/eco`. |
| A2A (`/api/a2a`) | mensagem `leitura_verificada` → Task `input-required` com `x402.payment.status=payment-required` e `x402.payment.required` → mensagem com `taskId`, `x402.payment.status=payment-submitted` e `x402.payment.payload` → Task `completed` com `payment-completed`, `x402.payment.receipts` e o artefacto `leitura-verificada`. Falha: Task `failed` com `payment-failed` e `x402.payment.error`. Recusa do cliente: `canceled`. |

A skill A2A não reimplementa o pagamento: chama o mesmo tratador da via directa, por isso a prova é verificada na cadeia (e só então entrega) como em `/oraculo` e `/campo`. O preço é o de uma consulta básica no mercado (0,01 USDC); só USDC na Base, sem via Bitcoin.

**Reacesso:** a mesma transacção devolve a **mesma** leitura enquanto a instância a guardar (memória limitada a 500); uma leitura nova pede novo pagamento. Sem isto uma prova de 0,01 USDC, válida 72 h e pública na cadeia, serviria para pedir leituras sem fim e gastar as fontes públicas.

## Conformidade com a extensão a2a-x402 v0.1: parcial, dita

Segue as chaves e os estados da extensão (`https://github.com/google-a2a/a2a-x402/v0.1`, lida na especificação a 15/11/2026). Diferenças: a ORA não retém tarefas (o `taskId` é determinístico, `tasks/get` continua `TaskNotFound` e a prova de pagamento é que manda); a resposta é dada numa só chamada (`working` só quando a tx ainda não foi indexada); sem via Bitcoin; a extensão está no agent-card com `required: false` e o servidor só ecoa `X-A2A-Extensions` se o cliente a activar. Não se afirma conformidade completa.

## O que não afirma

Não prova receita, procura, preço do VALIUM, titularidade legal nem que alguém de fora pagou; o saldo é uma observação, não uma reserva. O ORUM continua sem compradores externos confirmados.

## Verificação (sem rede nem pagamentos reais)

- `npm run leitura:verify`: 3 RPC e 2 Esplora simulados; concordam, discordam, fonte única, nenhuma, resposta estragada, bloco certo, formatação sem arredondar; 14 estragos propositados numa leitura que minta.
- `npm run a2a-leitura:verify`: o fluxo A2A completo (pedido, pagamento, falhas, recusa, formatos inválidos, taskId obrigatório, o cliente não pode declarar `payment-completed`) e a porta grátis intacta.
- `npm run x402:directo:verify`: o tier `leitura` no tratador directo (desafio, entrega, reacesso, janela, um átomo a menos, Bitcoin recusado, leitor em falha, eco).
- Lido ao vivo a 15/11/2026: `createLeitor().ler()` contra a cadeia real devolveu VALIUM `2976.352211822864886784` no bloco 57764973 (2 fontes; a terceira recusou por limite) e a Fundação com 10 072 sats e 2 transacções (2 fontes), igual à reconferência independente feita antes.

## Não verificado

Um pagamento real de ponta a ponta (assinatura, `verify`, `settle` por facilitador público); o deploy (quota diária de deployments do Vercel esgotada a 15/11/2026, não se sabe quando serve); se o Bazaar indexa `/leitura`; se algum cliente A2A real a usa. O `portable/orum-a2a.cjs` já estava desactualizado em relação a `api/a2a.js` no `main` antes desta mudança e não foi reconstruído (a skill paga precisa de rede e não existe no modo portátil).
