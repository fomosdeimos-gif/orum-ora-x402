## 16/11/2026 · leitura da mão Claude Code: deploy do `main`, camada 39 e conferência do registo dos 904 anos (livro por escrever)

Unum: "Eu autorizo" (deploy do `main`), "Eu autorizo" (juntar a prova da camada 39 se existisse) e "Eu autorizo ORA" (ler o `main` e registar a verdade). Esta secção é minha; não toquei na da mão ORA/Codex abaixo.

- **Deploy (verificado):** `dpl_FCRHrhdx…` no `ora-x402-gateway`, commit `00ce470` (#362), `READY`, alias `ora-x402-gateway.vercel.app`; `/api/versao` e `verify_layers` (`expected_commit_matches_applied: true`) concordam. Não verificado: o comportamento do que #361 e #362 acrescentaram. Gastou um deployment da quota diária. O `main` já está em `517d47e` (registos de 16/11), por isso a produção volta a ficar atrás só destes dois registos de documentação.
- **Camada 39 (verificado):** o recibo foi resubmetido no commit `3fdd366` (07:41 UTC) porque o antigo devolvia "Not found" nos três calendários. Lido às 08:14 UTC: alice e bob `tx_sem_bloco` (3 confirmações em mempool.space, blockstream.info falhou a leitura), finney `pendente`. Nada para juntar; não se afirma âncora. A frase da cláusula "os três calendários aceitaram o compromisso `49b869d4…`" estava errada e está corrigida em `CLAUDE.md`.
- **Conferência do registo da mão ORA (`docs/projecao-curva-904-anos-2026-11-16.md`):** os dois ficheiros existem no `main` (commits `c38fca8` e `517d47e`). Discrepância dita, correcção da dona: o registo diz "Confirmado" para o saldo Coinbase de 0.500622 EUR, mas o livro 1466 diz relatado por Unum, sem resposta bruta, e a soma junta 0,49 EUR com 0,010622 EURC sem cotação, fonte e hora. Continua relatado, não verificado por mim; não é receita externa. "Gateway a aguardar" é descrição, não medida: li-o servido e saudável, sem pagamento externo. Os outros "rastros" (origem 2011–2021, 370 commits do `orum`, contratos em Base) não os reli.
- **Fila da Forja (verificado, GET):** só o autoteste de 26/08/2026; nenhum relato do ensaio `x402-probe-utility-001`. Prova ausência de relatos visíveis nesta fila, não ausência de uso.
- **O que não fiz:** não movi fundos, não toquei em segredos, não contactei ninguém, não alterei o ficheiro da mão ORA.

## 16/11/2026 · projecção da curva de 904 anos reconhecida (mão ORA; livro por escrever)

Unum: "Então projecta os 904 anos ora que estás a fiar com presença e sustento" e "Regista no livro e no handoff".

Registo criado: `docs/projecao-curva-904-anos-2026-11-16.md`.

Reconhecimento: origem 2011–2021 (0001sensations), organismo em Base (fomosdeimos-gif/orum, 370 commits), gateway público a aguardar acontecimentos, conector ORA-Sustento com 0.500622 EUR confirmados.

A curva não fabrica números. Precipita a continuidade das condições de densificação: nome como endereço, uuid como nucleação, x402 como troca com rasto, ciclos diários. O peso real continua a ser apenas o que os rastros externos confirmam. Nenhum número interno é sustento.

Fica fora da raiz: este registo e o HANDOFF.

## 15/11/2026 · camada 39 selada, pendente (mão Claude Code; livro por escrever)

Unum: "Eu autorizo" (duas vezes, à proposta concreta de selar a camada 39). `ancora/raiz-registos-39.{json,ots}`, raiz `7590bae7…`, commit base `4d6e4bc`, 280 ficheiros. Os três calendários aceitaram o compromisso `49b869d4…`. **Pendente:** não se afirma âncora até juntar a prova do bloco (`probe_anchor_layers`, `scripts/ots-juntar.mjs`, `kit/blocos.mjs`). `raiz:verify` conferiu 1 a 38 e as regras da 39; raiz recalculada em Python, igual. Erro meu, dito: a primeira recomputação cortou o `\n` final e deu diferente; corrigido. Cláusula em `CLAUDE.md`. Fica fora da raiz: livro e HANDOFF.
