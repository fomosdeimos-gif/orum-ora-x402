# Bolo v1 — do ingrediente ao sustento · 15/10/2026

O organismo tem muitos ingredientes dispersos. Um bolo não é todos juntos: é **um** produto, **um** preço e **um** caminho que um comprador externo consegue percorrer de ponta a ponta. Este documento fixa esse caminho e diz, passo a passo, o que existe e o que não existe. Não prova procura e não promete receita.

## O produto

Oráculo (0,161 USDC) e Campo (0,33 USDC), servidos pela via directa no Vercel, sem Supabase.

Carteira de recebimento (Base, USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`): `0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5`.

## O caminho

| # | Passo | Onde vive | Estado em 15/10/2026 |
|---|---|---|---|
| 1 | Encontrar | `/.well-known/x402.json`, `/llms.txt`, `agent-card.json`, `/oraculo/eco` (amostra grátis) | Vivo: o manifesto lista só Oráculo e Campo (leitura de 15/10) |
| 2 | Receber o desafio | 402 v2 com `PAYMENT-REQUIRED` (`api/_x402-directo.js`) | Vivo |
| 3 | Pagar | USDC na Base, prova por `transactionHash`; EIP-3009 só com `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET` no Vercel | `transactionHash` vivo; EIP-3009 depende de Unum criar as variáveis |
| 4 | Entregar | leitura determinística por tx, janela de 72 h | Vivo, nunca exercido por comprador externo |
| 5 | Ver o recebimento | `/economia/recebimentos.json` | **Parcial:** na leitura de 15/10 cobriu 5 h das 72 h (limites dos RPC públicos) |
| 6 | Repartir | `/economia/tesouraria.json`: 70% sustento, 20% continuidade, 10% reserva | Zero, porque há zero compradores externos |

## O que bloqueia o bolo, e quem desbloqueia

- **Passo 5 (a ORA pode fazer):** o livro-razão da via directa só se vê inteiro com um RPC com alcance. Sem isso, um pagamento real pode ficar fora da janela lida.
- **Passo 3 (só Unum):** criar as variáveis CDP no painel do Vercel, para aceitar clientes x402 padrão.
- **Licenças (só Unum):** continuam a depender do Supabase. Os bytes das fotografias, o token do Blob privado e os segredos estão descritos em `docs/licenca/migracao-vercel-v1.md`. Não foram migrados.

## Fronteiras

- Um pagamento de Unum ou da ORA por esta via é validação interna, não adopção.
- Só entrada externa confirmada e classificada entra na repartição 70/20/10.
- Nada aqui altera preços, destinatário, limites ou percentagens.
- Este documento não prova que o texto esteja publicado nem que a produção o sirva.

`npm run bolo:verify` confirma, sem rede, que preços, carteira e repartição deste texto coincidem com o código e com a constituição.
