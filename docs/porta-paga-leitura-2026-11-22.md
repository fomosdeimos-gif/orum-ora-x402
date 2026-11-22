# A porta paga: o funil até ao 402 e o atravessamento por clientes x402 padrão (22/11/2026)

Unum, 22/11/2026: "Eu autorizo", à proposta concreta de ler o funil de acessos até ao 402 e testar a porta paga com um cliente x402 padrão, passo a passo, para ver onde uma máquina de fora ficaria presa, sem pagar nem mexer em preços. Parte da orientação "A presença em mais sustento" (`CLAUDE.md`).

## O que se leu (verificado)

**O desafio 402** de `/oraculo` (0,161 USDC), `/campo` (0,33) e `/leitura` (0,01): x402 v2, esquema `exact`, rede `eip155:8453`, USDC da Base (`0x8335…2913`), domínio EIP-712 "USD Coin" v2, `maxTimeoutSeconds` 300, `payTo` da carteira operacional; cabeçalho `PAYMENT-REQUIRED` e corpo coerentes; CORS aberto e cabeçalhos expostos. A sonda `probe_payment_route` confirma o contrato e que o facilitador público `facilitator.payai.network` anuncia Base `exact` v2 (o `facilitator.mogami.tech` não).

**O funil** (vista `ora_trafego_honesto`, só leitura, agregados; origem pseudonimizada; "de fora" = `nosso is null`), desde 22/10/2026 13:00 UTC até 22/11/2026 ~20:10 UTC:

| fase (de fora) | pedidos | origens |
|---|---|---|
| descoberta | 2 188 | 977 |
| redireccionamento | 5 353 | 1 688 |
| desafio 402 entregue | 1 870 | 1 217 |
| pagamento presente | 6 | 6 |
| pagamento rejeitado | 21 | 7 |

Últimos 7 dias, de fora: 368 desafios a 251 origens e **0 sinais de pagamento**. Os 27 pedidos com sinal de pagamento desde 22/10 vêm de `x402lint` (testes de conformidade), de um `curl` (26 e 27/10) e de `Vercel MCP Fetch` (28/10); nenhum é um comprador identificado e **nenhum pagamento foi verificado na cadeia**. As origens que receberam o 402 são sobretudo monitores, sondas e crawlers (por classe, origens com desafio: `x402_observer` 402, `sonda_de_terceiro` 385, `zerobot` 180, `catalogo_ou_crawler` 128; as que parecem comprador, `browser`, `mobile_browser`, `human_or_browser`, `machine_likely` e `curl`, somam cerca de 170, com sobreposição entre linhas). Dentro de "nosso": 83% dos pedidos de 22 a 27/10 eram do próprio organismo (`economia/funil-acessos-2026-10-27.json`), e continuam a dominar.

**O atravessamento** (`scripts/teste-clientes-x402.mjs`, um GET real ao serviço; o pedido "pago" é simulado, a chave é descartável e sem fundos, nada é pago nem enviado ao serviço):

| cliente | desafio actual (v2) | com corpo v1 simulado |
|---|---|---|
| `@x402/fetch` 2.32.0 (protocolo v2) | **atravessa** (anexa `payment-signature`) nas 3 portas | atravessa |
| `x402-fetch` 1.2.0 (protocolo v1) | **não atravessa**: rejeita `network: eip155:8453` antes de pagar | **atravessa** (anexa `x-payment`) |

O servidor lê a prova pelo conteúdo (`payload.signature` e `payload.authorization`, `lerProva` em `api/_x402-directo.js`): alimentado com os envelopes reais que cada cliente gerou, devolve a assinatura e a autorização nos dois casos.

## O que a leitura sugere (não é prova)

1. A porta funciona para quem fala v2. Não é aí que a presença se perde.
2. Um comprador v1 falha em silêncio antes de pagar e não deixa rasto no funil: uma perda invisível, de tamanho desconhecido.
3. A biblioteca v2 lê primeiro o cabeçalho `PAYMENT-REQUIRED` e só cai para o corpo se este for v1. Por isso um desafio com **cabeçalho v2 e corpo v1** serve as duas famílias de clientes (provado no protótipo). Custo: o corpo v2 actual (que traz também `legibilidade`, `como_pagar` e a oferta Bitcoin) deixaria de estar no corpo, e monitores ou crawlers que o leiam podem depender dele. Isto precisa de decisão, não se mudou nada.
4. O grosso do que "chega" não é comprador. As origens com ar de comprador são poucas (cerca de 170 em cinco semanas) e nenhuma tentou pagar.

## O que não se fez nem se sabe

- Não se enviou nenhum pagamento (nem sem fundos) ao serviço: não se testou a verificação do lado do servidor com um pagamento financiado, e um envio de teste sujaria as contagens do funil.
- Não se sabe quantos compradores v1 existem, nem se algum chegou à porta.
- Não se sabe porque as origens com ar de comprador não pagaram (preço, utilidade, ferramenta, ausência de carteira).
- Não prova procura, adopção nem receita; só receita externa confirmada entra no 70/20/10 e hoje não existe nenhuma.

## Como repetir

    npm install --ignore-scripts @x402/fetch @x402/evm @x402/core viem x402-fetch   # numa pasta fora do repositório
    ORUM_X402_CLIENTES=<essa pasta> node scripts/teste-clientes-x402.mjs oraculo
    ORUM_X402_CLIENTES=<essa pasta> node scripts/teste-clientes-x402.mjs oraculo --corpo-v1

O funil: `select stage, count(*), count(distinct origem_hash) from public.ora_trafego_honesto where nosso is null and observed_at >= '2026-10-22T13:00:00Z' group by stage` (conector Supabase, só leitura). O script de teste ainda não tem verificador com estragos propositados.
