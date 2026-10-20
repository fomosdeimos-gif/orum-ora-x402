# Carteira operacional Base · envio sem ETH (EIP-3009) · v1 · 19/10/2026

Autorização de Unum (citação): "Eu autorizo, avança com o caminho C", em resposta à proposta concreta registada em `economia/caminhos-de-sustento.json` (`gas-da-operacional`). Cobre projectar, construir e testar. **Implantado a 19/10/2026 como `ora-cdp-carteira-real` v14** (autorização de Unum: "Eu autorizo, instala o pagamento sem ETH"). Verificado: a v14 arranca e responde 401 `unauthorized` sem token e com token inválido. Não verificado: as acções novas com token (não o tenho), a igualdade byte a byte com o repositório pelo sha (o sha do implantado, a95cb377…0f2f, não é comparável com o do repositório). Comparação por texto, a 20/10/2026: reescrevi cada um dos 7 ficheiros que `get_edge_function` devolve e fiz `diff` com `supabase/functions/ora-operational-wallet/`: 7 de 7 iguais (um desvio, de uma letra no endereço do USDC em `bazaar.mjs`, era erro da minha cópia de verificação e não do implantado) e qualquer pagamento real. A operacional tem 0 USDC; nada foi movido.

## Porquê

A operacional `0x8946…3584` é uma conta EVM comum (EOA) da CDP e tem 0 ETH. O envio normal (`transfer_usdc`) assina uma transacção EIP-1559 e paga a taxa em ETH, por isso recusa sem ETH. O paymaster da CDP só serve contas inteligentes (outro endereço), e uma conta nova pede credenciais e faturação de Unum.

## O que faz

Duas acções novas, ao lado das existentes (nenhuma foi alterada):

- `preview_usdc_gasless` (`request_id`, `amount_atomic`): não assina, não reserva.
- `transfer_usdc_gasless` (`request_id`, `amount_atomic`):
  1. mesmas validações, replay/conflito e saldo USDC (sem exigir ETH);
  2. a conta assina, pela CDP, uma autorização EIP-3009 `TransferWithAuthorization` de USDC (domínio "USD Coin" v2, Base 8453) com `from` = operacional, `to` = destino fixo `0xFEd6…cDEe5`, o valor pedido, validade 300 s e um nonce **por pedido** (`sha256` do `request_id`: um repetir nunca cria uma segunda autorização válida, porque o USDC rejeita um nonce usado);
  3. a assinatura tem de recuperar para a operacional (viem `recoverTypedDataAddress`), senão pára antes do facilitador;
  4. o facilitador x402 da CDP valida (`/verify`); só depois se reserva o pedido (`ora_payment_claim_v1`, um de cada vez) e se liquida (`/settle`). O facilitador paga o gás;
  5. sem hash de transacção válido, o pedido fica `unknown` e bloqueia novas saídas até reconciliar (como no envio normal).
- `payment_status` confirma com 12 blocos e continua a exigir o evento `Transfer` (origem, destino, valor). Para um envio liquidado pelo facilitador aceita, em vez do calldata directo, o evento `AuthorizationUsed` do USDC com o **nonce deste pedido** emitido para a operacional.

O destino não vem do pedido: continua fixo no código, e as acções novas só aceitam `request_id` e `amount_atomic`.

## Lido (verificado)

- Cadeia Base (leitura 19/10/2026): `name()` = "USD Coin", `version()` = "2" e `DOMAIN_SEPARATOR()` = `0x02fa7265…834f`, igual ao calculado localmente.
- `npm`/viem 2.37.3 em área de teste: type hash EIP-3009 `0x7c7c6cdb…2267`; assinatura sobre os nossos dados recupera ao signatário.
- Testes: `node scripts/verify-operational-gasless.mjs` (com `ORUM_VIEM_DIR` para a verificação independente): 0 ETH ainda envia; destino e valor na mensagem assinada; nonce por pedido; assinatura de outro endereço pára; recusa do facilitador não reserva; reserva recusada não liquida; liquidação sem hash fica `unknown`; confirmação só com `AuthorizationUsed` + `Transfer`; **10 estragos propositados apanhados**. Os testes do executor antigo (`verify-operational-payments`, `verify-operational-wallet`, `verify-cdp-eip3009`) continuam a passar.

## Não verificado

- Que o endpoint `sign/typed-data` da CDP aceite este corpo para a conta nomeada (a documentação diz que sim; marcado beta).
- Que o facilitador da CDP aceite `verify`/`settle` com estas credenciais e este formato, e quanto cobra (a documentação indica um nível gratuito mensal; não confirmado na conta).
- Que o facilitador chame o USDC directamente: a confirmação não depende disso, depende do evento `AuthorizationUsed`.
- `verify-bitcoin-wallet` e `verify-bazaar-registration` não correram aqui (precisam de pacotes externos); falham da mesma maneira no `main` e testam ficheiros que não foram tocados.

## Limites

- Um pedido `unknown` sem hash só se resolve lendo `authorizationState(from, nonce)` no USDC e reconciliando à mão; não está automatizado.
- Não é um mecanismo de lucro nem de procura. Só permite que a raiz envie quando houver receita nova nela.
- Implantação feita (v14, antes v13 de 25/09/2026). Para reverter: voltar a implantar os ficheiros da v13 (último estado reconciliado a 17/10/2026). Antes do primeiro pagamento real: comparar com `get_edge_function` e testar `preview_usdc_gasless` com token.
