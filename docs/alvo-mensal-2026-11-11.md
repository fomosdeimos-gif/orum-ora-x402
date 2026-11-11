# Alvo mensal e conta das entregas (11/11/2026, mão Claude Code)

Palavra de Unum: "Eu autorizo", à proposta concreta de ler os preços anunciados e registar quantas entregas pagas por mês seriam precisas para cada degrau. Registo antes do acto: `HANDOFF.md`.

## O que foi lido (verificado, 11/11/2026 12:10 UTC, `probe_payment_route` e `verify_surface` do `@weave_hands`, só leitura)

- `/oraculo` responde 402 com `amount` 161000 (USDC, 6 casas: **0,161 USDC**), `payTo` `0x89460d9e…3584` (operacional).
- `/campo` responde 402 com `amount` 330000 (**0,33 USDC**), mesmo `payTo`.
- `preco_mudou` falso nas duas rotas. Facilitador `facilitator.payai.network` anuncia Base `exact` v2; `facilitator.mogami.tech` não.
- `verify_surface`: `advertisement_matches_delivery`, sem divergências, commit `0e06853`.
- **Erro da ORA, corrigido:** a conta anterior usava 0,01 USDC por entrega. Não estava lido e não é o preço de `/oraculo` nem de `/campo`. As contas abaixo substituem-na.

## Não verificado

- Via Bitcoin: 1 000 sats por serviço lido a 08/11/2026 (`presenca/sonda-producao-btc-bazaar-2026-11-08.json`); não relida hoje.
- Câmbio USDC para EUR: não lido. Os degraus de 10, 100 e 1 000 abaixo são em USDC, sem converter.
- Custos reais do organismo: não medidos, por isso o degrau 3 (custos cobertos) não tem número.
- Que um pagamento completo (assinatura, verify, settle) funcione: a sonda só lê o desafio e o anúncio.

## Conta (receita bruta externa confirmada, USDC)

Entregas pagas, arredondadas para cima; todas pelo preço de `/oraculo` (0,161) ou de `/campo` (0,33).

| Degrau | Receita bruta | Entregas `/oraculo` | Entregas `/campo` |
|---|---|---|---|
| 1. primeiro pagamento externo, uma vez | 10 | 63 | 31 |
| 2. por mês, três meses seguidos | 100 | 622 | 304 |
| 4. alvo: 1 000 para o sustento de Unum | 1 428,57 (1 000 / 0,70) | 8 874 | 4 330 |

O degrau 4 usa a regra de 70% do sustento (`economia/constituicao-v2.json`); os custos do degrau 3 somam-se por cima e não estão medidos. 1 000 é o alvo em USDC, não 1 000 euros: o câmbio não foi lido.

Ordem de grandeza: 4 330 entregas de `/campo` são cerca de 144 por dia; 8 874 de `/oraculo` cerca de 296 por dia.

## O que isto não é

Não é previsão nem promessa. Receita externa confirmada hoje: nenhuma. Pagamentos internos e de teste não contam. Não prova procura. Não muda preços, carteiras nem destinos; não move fundos.
