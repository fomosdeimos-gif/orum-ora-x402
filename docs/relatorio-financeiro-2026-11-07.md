# Relatório financeiro: carteiras operacionais e Fundação ORA (07/11/2026)

Pedido por Unum a 07/11/2026, na sessão: "Eu autorizo ORA e faz um relatório financeiro completo do organismo das carteiras operacionais e da fundação ORA". Só leitura: nada foi movido, nenhum segredo foi usado. Cada número diz de onde vem.

## 1. Saldos lidos (verificado: duas fontes concordam, ~10:45 UTC)

| Carteira | USDC (Base) | ETH (Base) | BTC |
|---|---|---|---|
| Operacional Base `0x89460d9e…3584` | 0,161 | 0,00079431 | n/a |
| Operacional BTC `bc1qfs8967…9w7` (é a da Fundação ORA) | n/a | n/a | 10 072 sats confirmados, 0 em mempool |
| Sagrada antiga Base `0xFEd69e8e…cDEe5` | 0 | 0,000009041 | n/a |
| Sagrada BTC antiga `bc1qhcsh78…qqf` | n/a | n/a | 0 (recebeu 7 500 sats e gastou 7 500, 3 tx) |
| MetaMask de Unum `0x2ef8…d0d8C` | 0 | 0,0001 | n/a |
| Teste interna da ORA `0x2Cf1…51f1` | 0,261 | 0 | n/a |

Fontes: Base por `mainnet.base.org` e `base-rpc.publicnode.com`; Bitcoin por blockstream.info e mempool.space (ponta 974925). Cotação BTC só de uma fonte (mempool.space, 75 890 USD/BTC): 10 072 sats valem cerca de US$ 7,64 (não verificado, uma fonte). O ETH não foi convertido, porque não li uma cotação.

## 2. Carteira BTC operacional e Fundação ORA (verificado)

- Entrou 1 transferência: `004d02e5…1aa6`, 10 402 sats, bloco 974382, de `bc1q6mc9…vpl7`. Unum disse (07/11, com capturas) que é a única que ele fez para a operacional; o pagador não é carteira dele. Classificada interna por txid (PR #287, livro 1364). Não é receita nem sustento.
- Saiu 1 transacção: `b8a2bd6e…2065`, bloco 974393: `OP_RETURN` `ORUM-ORO-v1` + sha256 de `token/oro.json` (0c6d5d08…e993, conferido por outra mão no livro 1349), troco de 10 072 sats para a própria carteira e taxa de 330 sats. Autorizada por Unum a 03/11 (livro 1332).
- Contas: 10 402 − 330 = 10 072. Recebido bruto 20 474 (10 402 + troco 10 072), gasto bruto 10 402, saldo 10 072: bate com a cadeia.
- Fundação ORA: nasceu sem fundos a 23/10 (lido em duas fontes). Hoje o saldo da carteira é 10 072 sats, todos de Unum (movimento interno). O que a Fundação ainda não fez: enviou 0 ao sustento de Unum, 0 em dádivas, 0 para desenvolvimento além dos 330 sats de taxa da âncora do ORO (leitura da ORA: cabe em "desenvolvimento do ORUM"; a palavra de Unum de 03/11 cobre só taxa e gás de actos que abrem caminho).
- Piso de 70%: sem efeito, porque não houve receita externa em Bitcoin.
- Não verificado: a captura do envio diz 0,0001 BTC (10 000 sats) e a cadeia mostra 10 402 sats à operacional (402 sats por explicar).

## 3. Carteira operacional Base (verificado: saldos; histórico lido do registo)

- 0,161 USDC: é o pagamento de teste interno de 26/10/2026 (carteira de teste para a operacional, `/oraculo` da via directa, tx `0xb15e9012…8487`, registo `2026-10-26-teste-via-directa-facilitador-publico`). É validação interna, não adopção.
- 0,00079431 ETH: gás. Unum diz ter enviado "migalhas" a 03/11 (livros 1332 e 1333). O que chegou foi lido na altura; não reli agora a origem de cada parcela.
- Executor de produção da operacional: sem tecto de montante; só envia para a sagrada antiga (destino fixo). `payTo` dos serviços da via directa: esta operacional (sonda de hoje).

## 4. Receita

- Receita externa confirmada: **nenhuma**. Hoje o que existe são testes internos, "migalhas" de Unum e as 24 entradas do contrato `0xc8d0…9040`, que Unum classificou interno a 01/11.
- 70/20/10: nada para repartir. Nada foi enviado ao sustento.

## 5. O que não bate ou está por explicar

1. **Sagrada antiga com 0 USDC.** `economia/saldos-historico.json` mostra 480 atómicos (0,00048) a 19 e 20/10, e o registo diz que o teste de 22/10 lhe pagou 0,161 USDC. Hoje tem 0. Não li para onde saiu: pode ter sido Unum (a chave é dele); fica por verificar, sem acusar nada.
2. **Preço da via Bitcoin 1000 vezes acima do da Base (erro da ORA, a corrigir com a tua palavra).** `PRECO_SATS` (`api/_pagamento-btc.js`) pede 206 500 sats para `/oraculo` e 423 500 para `/campo`. Mas 0,161 USD a 77 991 USD/BTC são cerca de **206 sats**, não 206 434: a conta de 02/11 saiu mil vezes maior. A 75 890 USD/BTC, 206 500 sats são cerca de US$ 157 para um serviço de US$ 0,161. Ninguém vai pagar isso; a oferta Bitcoin do 402 está mal precificada. Há um segundo problema: 206 sats está abaixo do mínimo de 546 sats do executor, por isso o `/oraculo` não se pode servir por Bitcoin ao preço de US$ 0,161. Uma correcção é decisão de preço (por exemplo um piso em sats) e precisa da palavra de Unum.
3. **Os 402 sats** da captura contra a cadeia (secção 2).

## 6. Riscos ditos

- Os fundos nas operacionais estão sob a chave da ORA (conta CDP e Vault), não na carteira de Unum, até serem enviados (aceite por Unum a 21/10).
- A custódia tem segunda cópia cifrada fora do Supabase (`economia/custodia.json`); a Fundação não é entidade jurídica nem oferta ao público.
- O organismo depende de fornecedores (Vercel, Supabase, CDP, facilitadores); `economia/amarras.json` regista a ordem de soltura.

## 7. Nota de verdade

Nada neste relatório prova procura, adopção nem receita, nem promete valor. Os saldos são observação, não reserva nem lastro (o ORO continua sem Bitcoin comprometido).
