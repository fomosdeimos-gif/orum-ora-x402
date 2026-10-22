# Avaliação: baixar o preço das licenças? (22/10/2026)

Pedido de Unum, 22/10/2026 (livro 960): "avalia a opção de baixar o preço das licenças como tinhas sugerido". Isto é uma avaliação. Nenhum preço foi alterado, nada foi implantado. Mudar um preço é código implantado e precisa de uma palavra de Unum a uma proposta concreta.

## O que está lido (verificado, base `orum-memoria`, 22/10/2026)

Preços em `supabase/functions/ora-licenca/index.ts` (v60, igual ao implantado desde o PR #113):

| Licença | Preço | Nota |
|---|---|---|
| `consulta` | 1,618 USDC | uso privado, 30 dias, 300 s de acesso |
| `editorial` | 16,18 USDC | publicação editorial com atribuição |
| `treino` | 161,80 USDC | treino/avaliação de máquinas, não exclusiva |

Tráfego em `ora_trafego_honesto`, últimos 30 dias (leitura corrigida, ver `economia/trafego-honesto-2026-10-22.json`):

| Serviço | Tentativas | Nossas (provadas/prováveis) | De terceiros | Famílias de user-agent de terceiros | Desafios 402 a terceiros |
|---|---|---|---|---|---|
| ora-licenca | 10 007 | 8 077 | 1 930 | 27 | 552 |
| ora-x402 | 4 258 | 4 067 | 191 | 14 | 147 |
| ora-oraculo | 1 313 | 1 253 | 60 | 10 | 0 |

Quem recebeu os 552 desafios de licença (terceiros, 30 dias): `x402-observer/1.0` 280, `agentprobe/0.1.0` 69, `Mozilla/5.0` (zerobot) 38, `BrickBlueBot` 31, `TaifoonHarvester` 28, `hermes-contact-discovery` 24, `Mozilla/5.0` (móvel) 19, `AgenstryBot` 13, `agents-trust-probe` 12, `Mozilla/5.0` (browser) 9, e outros. A esmagadora maioria são monitores, sondas e catálogos. Por caminho: `consulta` 227, `treino` 172, `editorial` 153.

Pagamentos: `ora_pagamentos` tem 22 pagamentos verificados em cadeia desde 13/07/2026 (18,72 USDC no total) e **todos de carteiras classificadas `interno`** (as de Jorge e a carteira de teste da ORA). Sinais de pagamento nas tentativas de licença: 7 em 30 dias, todos de testes nossos ou do linter `x402lint`, rejeitados. **Pagamento externo confirmado: nenhum.**

## O que isto permite e não permite concluir

- **Não está provado que o preço seja a barreira.** Nenhum comprador externo identificável chegou a ver o preço e a desistir: quem recebeu o 402 foi quase só máquina de infraestrutura que mede e lista servidores. O dado que faltaria (quantos visitantes distintos, não-ferramentas, viram o preço e quantos pagaram) não existe: `origem_hash` está vazio nas funções que cobram.
- Com zero vendas externas, baixar o preço não custa receita medida; mas também não há nenhuma evidência de que traga alguma. É uma hipótese, não uma leitura.
- Comparação com micropagamentos típicos de 1 a 10 cêntimos: veio de pesquisa anterior da ORA e não foi verificada com fonte primária; não a uso como prova.
- Os valores 1,618 / 16,18 / 161,80 seguem a razão áurea do organismo. Baixá-los quebra essa coerência simbólica, que é uma escolha de Unum, não minha.
- `treino` (161,80 USDC) é a única licença com uma procura plausível do lado das máquinas (proveniência humana verificada), mas é também a mais cara; ninguém a tentou pagar.

## Opções

1. **Manter os preços e medir primeiro (recomendada).** Instrumentar `origem_hash` nas três portas pagas para contar visitantes distintos que não sejam ferramentas. Regra de decisão, escrita antes de ver os dados: se, passados 14 dias, houver pelo menos 20 visitantes distintos de tipo browser/agente (não monitor, não sonda, não crawler) a receber o 402 de `consulta` e nenhum pagar, então testa-se baixar só `consulta`; se houver menos de 20, o preço não é a limitação, é a descoberta, e baixá-lo seria mexer no que não está a falhar.
2. **Baixar já só `consulta`** (por exemplo para 0,161 USDC, o preço do oráculo). Custo: um redeploy de `ora-licenca` (função grande de 64 kB, 3 ficheiros), sem leitura que o justifique; ganho: nenhum medido.
3. **Baixar as três.** Pior das três: mexe em `treino` e `editorial` sem qualquer sinal de que alguém as queira ao preço actual ou a menos.

## Decisão da ORA

Recomendo a opção 1. É o caminho com menos código novo e que cumpre a verdade: não se muda um preço para resolver um problema que ainda não foi medido. O custo é um redeploy das três portas pagas com `origem_hash`, que **precisa da palavra de Unum** (ver o próximo passo no HANDOFF). Esta avaliação não promete receita, reembolso nem procura, e nenhum texto público a usa como promessa.

## Limites

- Os números são de 30 dias e dependem da classificação por user-agent; a atribuição "nossas" tem prova só para as regras de `ora_ua_nosso` (as "prováveis" não contam como internas).
- Visitantes distintos continua sem medida directa.
- Os sete sinais de pagamento são de testes nossos e do linter em setembro (12/09 a 24/09); a janela de 30 dias é maior que isso.
