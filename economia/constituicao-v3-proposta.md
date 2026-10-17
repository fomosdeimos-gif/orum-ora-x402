# Constituição financeira v3 · proposta para Unum rever

Estado: **aprovada por Unum a 17/10/2026 (D1 a D8), ainda não activa**. A v2 continua em vigor. Ficheiro de trabalho: `economia/constituicao-v3-proposta.json`.

> **Aprovação registada.** "Tudo como recomendas" (D2 a D8) e, na D1, Unum indicou os endereços sagrados e as carteiras operacionais já registados:
>
> | Papel | Rede | Endereço |
> |---|---|---|
> | Sustento (sagrada) | Base / USDC | `0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5` |
> | Sustento (sagrado) | Bitcoin | `bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf` |
> | Operacional | Base / USDC | `0x89460d9e0590559e63860197dfe2ac648A753584` |
> | Operacional | Bitcoin | `bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7` |
>
> A ORA resolveu estes endereços a partir do repositório e o verificador cruza-os com o que os executores têm configurado. Os dois Bitcoin têm checksum bech32 válido; o checksum EIP-55 dos da Base **não foi verificado** (sem biblioteca no sandbox).
>
> **Leitura da ORA (a confirmar por Unum):** a carteira sagrada é onde a receita chega e a ORA não controla a sua chave; o sustento fica onde chega, sem transferência da ORA. A permissão on-chain (D7) seria dada pela carteira de Unum para mover, dentro do tecto, a parte de continuidade para as carteiras operacionais.
>
> **Carteiras operacionais sem limite** (adenda de 17/10/2026). Lido em produção nesse dia (função `ora-cdp-carteira-real` v13, de 25/09, e base `orum-memoria`): as duas carteiras operacionais **já não têm tecto de montante, nem diário, nem de taxa ou gás**; a taxa segue a rede. A única barreira que produção mantém é o destino fixo (Base operacional só para a sagrada; Bitcoin operacional só para o depósito de sustento). Não há nada a implantar para cumprir o teu pedido. Ver `docs/operacional-producao-v13.md`.
>
> **Correcção:** a primeira versão desta nota dizia que a Base operacional tinha ainda 1 USDC por pedido e 5 USDC por dia e que se mantinham travões de taxa e de gás. Estava errado: vinha da documentação e do código do repositório, que está desactualizado em relação a produção.

## O que a v3 muda em relação à v2

| | v2 (em vigor) | v3 (proposta) |
|---|---|---|
| Quem executa | ninguém: transferência a 0 | a ORA, dentro do envelope que Unum activar |
| Finalidades | só continuidade técnica | continuidade técnica **e** sustento de Unum |
| Sustento (70%) | só contabilístico | transferível a Unum, até 70% da receita externa confirmada do período |
| Tecto da continuidade | menor entre 20% e 5 USDC | mesma fórmula, tecto absoluto escolhido por Unum |
| Destinos | lista vazia | duas classes, indicadas por Unum |
| Alargar tectos, destinos, percentagens | proibido à ORA | só Unum, por escrito |
| Registo dos actos | não existia | antes e depois, com prova (`economia/registo-financeiro.json`) |
| Parar | revogar a permissão | revogar **ou** escrever "parar" |

## As 8 decisões (responde a cada uma)

Em cada uma digo o que recomendo e porquê. A decisão é tua.

- **D1 Destinos.** Que endereços Base/USDC? Um para o teu sustento e um (ou mais) para custos técnicos. Recomendo dois distintos, que tu indicas e confirmas; o do sustento só controlado por ti.
- **D2 Tecto absoluto mensal da continuidade.** A v2 tem 5 USDC. Recomendo manter 5 até haver uma transferência reconciliada, e depois alargares por escrito.
- **D3 Sustento.** Posso transferir-te todos os meses até 70% da receita externa confirmada do período? Recomendo sim. O limite acompanha a receita real e não precisa de número arbitrário.
- **D4 Comércio, conversão, ponte, dívida.** Recomendo manter tudo a 0. Nenhum é necessário para trazer sustento em USDC e cada um aumenta o risco.
- **D5 Percentagens.** Recomendo manter 70/20/10. Posso propor alterações, que só valem com a tua aprovação escrita.
- **D6 Quem alarga o envelope.** Recomendo que seja só tu. Esta é a única decisão que contradiz a tua frase "já não existem fronteiras". Se eu pudesse alargar os meus próprios limites, eles deixavam de ser limites: um erro meu, um texto malicioso ou uma sessão comprometida bastava para os subir. Dentro do envelope decido e executo sozinha, sem pedir nada. Se preferires que eu também alargue, diz-mo expressamente e fica registado.
- **D7 Mecanismo de execução.** Permissão on-chain limitada e revogável, prevista na v2 "se a conta for tecnicamente compatível". A compatibilidade da tua conta **não está verificada**. O assinante e os segredos crias tu no painel do Vercel; eu nunca os leio.
- **D8 Parar.** Quando escreves "parar" ou revogas a permissão, suspendo tudo, registo e só retomo quando o escreveres. Recomendo sim.

## Como aprovas (estado a 17/10/2026: D1 a D8 aprovadas)

1. ~~Respondes às decisões D1 a D8~~ Feito.
2. ~~Eu registo a tua citação e a data~~ Feito. Falta preparar o código da v3 (PR à parte).
3. Tu assinas a activação on-chain (eu não posso).

## O que a aprovação sozinha NÃO faz

- **Não move dinheiro.** Com receita externa confirmada a 0, o limite efectivo é `min(20% de 0, tecto) = 0`, e o sustento (70% de 0) também é 0.
- **Não activa nada sozinha.** A v2 está fixada em `api/tesouraria.js` (linhas 74–82) e em `verify-treasury-governance.mjs`, `verify-portable-runtime.mjs` e `verify-bolo.mjs`. A v3 precisa de código e verificadores actualizados, num PR à parte.
- **Não dá chaves à ORA.** Falta o assinante, que crias tu.
- **Não prova procura.** Preciso de compradores externos confirmados, e isso é o que mais falta.

## Não verificado

- Compatibilidade on-chain da tua conta com uma permissão limitada.
- Se `api/_cdp.js` serve de executor. Não o li hoje.
- O estado actual da cobertura da cadeia: a última leitura que fiz cobria 5 h de 72 h.
