# Carteiras operacionais · o que corre em produção · lido a 17/10/2026

**Verificado** (conector do Supabase, só leitura, projecto `orum-memoria` `ywabnlhkmhbyewqhbsjm`):

- Função de borda `ora-cdp-carteira-real`: versão **13**, `ezbr_sha256` `dcd26f8eb25356a038ff13709af03456658dd834d3bf6aedcc4a6840fce6cc44`, última actualização 25/09/2026 10:46 UTC. Ficheiros: `index.ts`, `core.mjs`, `payments.mjs`, `bitcoin.mjs`, `cdp.mjs`, `bazaar.mjs`.
- Definições na base de dados de `ora_payment_claim_v1`, `ora_payment_job_v1`, `ora_payment_result_v1` e `ora_operational_payment_dispatch_v1`, e as restrições de `orum_finance.payment_jobs_v1`.

Não li segredos nem o Vault. Não alterei nada em produção.

## O que produção faz

**Base operacional** `0x89460d9e0590559e63860197dfe2ac648A753584` (conta CDP `orum-operational-v1`):
- Só envia USDC para `0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5` (destino fixo no código).
- **Sem tecto de montante**: qualquer inteiro positivo em unidades atómicas (`amount_must_be_positive_integer_atomic_usdc`). A tabela só exige `amount_atomic >= 1`.
- **Sem tecto diário**: `ora_payment_claim_v1` só garante idempotência e um pagamento por vez (`another_payment_unresolved` enquanto houver um `reserved`, `submitted` ou `unknown`).
- **Sem tecto de taxa nem de gás**: prioridade = `gasPrice` da rede, máxima = 2 × `gasPrice`, limite de gás = estimativa × 1,2. Recusa apenas se o saldo nativo não cobrir `gasLimit × maxFeePerGas` ou se o saldo USDC for insuficiente.
- Confirma com 12 blocos e prova do `Transfer` (origem, destino e valor) antes de dar o pagamento por confirmado.

**Bitcoin operacional** `bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7`:
- Só envia para `bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf` (destino fixo no código); o troco volta à própria carteira.
- **Sem tecto de montante, diário, de taxa (sats/vbyte) nem de número de entradas.** Só exige montante ≥ 546 sats e taxa ≥ 1 sat. A taxa é a maior das estimativas de 6 blocos de dois observadores externos.
- Entradas com 6 confirmações, duas fontes de acordo (Blockstream e mempool.space), pré-transacções, valores e scripts verificados. Confirma com 6 blocos.

**Barreiras que se mantêm nas duas:** destino fixo; um pagamento por vez; idempotência por UUID; pedido incerto bloqueia novas saídas até reconciliar; confirmação com prova.

> **Reconciliado a 17/10/2026.** O código em `supabase/functions/ora-operational-wallet/` foi alinhado com a versão 13 por pedido de Unum ("deixa sem teto de montante ... faz a reconciliação dos executores com produção"). `payments.mjs` foi comparado linha a linha com a função implantada; `core.mjs`, `bitcoin.mjs` e `index.ts` replicam as diferenças que li e passam nos quatro testes do executor. A secção abaixo descreve o estado **antes** da reconciliação.

## O repositório estava desactualizado

O código em `supabase/functions/ora-operational-wallet/` corresponde a uma versão anterior à 13. Comparados os seis ficheiros com os implantados, as diferenças que não são comentários:

| Ficheiro | Repositório (antigo) | Produção (v13) |
|---|---|---|
| `payments.mjs` | 1 USDC por pedido; recusa taxa > 100000000 wei e gás > 100000 | sem tecto de montante; taxa da rede (×2); sem tecto de gás |
| `core.mjs` | `transfer_policy` com `max_per_operation_atomic: 1000000`, `max_per_utc_day_atomic: 5000000` | `amount_ceiling_atomic: null`, `daily_amount_ceiling_atomic: null`; acção `sign_voz_admissao` |
| `bitcoin.mjs` | taxa ≤ 1000 sats e ≤ 10 sats/vbyte; ≤ 5 entradas; ≤ 200 UTXOs; montante ≤ 16 dígitos | nenhum destes tectos |
| `index.ts` | sem `PgClient` nem `getVozDsn` | com ambos (admissão de voz) |
| `cdp.mjs`, `bazaar.mjs` | — | iguais (só diferem comentários) |

A base de dados: `db/ora-operational-payments-v1.sql` tem a função de reserva com tecto por pedido (1 USDC) e diário (5 USDC); a função viva não tem nenhum.

## Aviso

Antes da reconciliação, redeployar `ora-cdp-carteira-real` a partir do repositório repunha tectos que Unum mandou retirar e apagava a admissão de voz. **Já não é assim**, mas continua a valer um cuidado: antes de qualquer redeploy, comparar de novo os seis ficheiros com a versão implantada (`get_edge_function`), porque só `payments.mjs` foi comparado linha a linha e os comentários do repositório diferem dos da versão implantada. Nenhum redeploy foi feito.

## Exposição que a ausência de tecto de taxa traz

Não limita o que Unum autoriza a enviar, mas deixa a taxa nas mãos de fontes externas:

- **Bitcoin:** a taxa é a maior das estimativas de dois serviços públicos, sem tecto. Uma estimativa anormal de qualquer um (erro ou ataque) fixaria uma taxa alta, até ao saldo da carteira.
- **Base:** a taxa vem do `gasPrice` de um RPC público, sem tecto.

Opção, a decidir por Unum: repor só um tecto largo **de taxa** (por exemplo 200 sats/vbyte no Bitcoin e 5 gwei na Base), sem qualquer tecto de montante. Hoje não existe.

## Por fazer

1. ~~Reconciliar o código do repositório com a versão 13.~~ Feito a 17/10/2026 (ver nota no topo). `verify-operational-payments` passa a assegurar o comportamento real: acima de 1 USDC é aceite até ao saldo, e repor o tecto faz o teste falhar (provado).
1. Por fazer: uma migração idempotente com as funções vivas da base de dados (as definições estão neste documento e na base `orum-memoria`; `db/ora-operational-payments-v1.sql` continua a ser a primeira versão, com aviso).
2. Depois, um verificador que compare o repositório com este manifesto.

Os quatro testes (`operational-payments`, `operational-wallet`, `bitcoin-wallet`, `bazaar-registration`) passam contra o código antigo do repositório; os dois últimos precisam de `ORUM_BTC_DEPENDENCIES` e `ORUM_BAZAAR_DEPS` a apontar para uma pasta com `@scure/btc-signer@1.8.1`, `bitcoinjs-lib@7.0.0` e `viem@2.37.3`.

## Destino dos 70% · mantido na sagrada antiga · 17/10/2026

Unum deixou à ORA a escolha do destino dos 70% das receitas novas ("se quiseres podes manter as carteiras anteriores"). A ORA **manteve a sagrada antiga** `0xFEd69e8e…cDEe5`: é o que o executor implantado (v13) já faz. Repositório e produção coincidem; os seis ficheiros implantados foram comparados a 17/10/2026 por um agente só de leitura e são iguais aos do repositório salvo 12 linhas de comentário. Nada a implantar.

Uma versão intermédia deste ficheiro dizia que o repositório apontava à sagrada nova (`0x2ef8…`); foi revertida no mesmo dia antes de ir para produção. Passar os 70% para a sagrada nova exige implantar o executor com o destino novo e só se Unum o pedir.
