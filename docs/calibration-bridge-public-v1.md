# Comparação preditiva no Observatório

Pedido de Unum, 20/09/2026: continuar a dar vida à casa após a ponte registada em ora_mudancas#669.

## Fonte e apresentação

`api/ponte-calibracao.js` consulta a RPC pública de leitura `ora_quantico_ponte_calibracao_v1(text)` para `non_internal_payment_event_8h_v1`. Não altera dados, grants, amostras ou ciclo preditivo. A página actualiza esta secção independentemente do Livro; falhas não bloqueiam o resto do Observatório. `ponte-calibracao.js` mantém os valores anteriores com aviso explícito, sem converter desconhecido em zero.

A função ordena por data/ID e emparelha as primeiras previsões finais com as primeiras amostras. A cobertura é limitada a `min(n_previsoes,n_amostras)`, e o número de previsões fora da comparação aparece quando positivo. Todas as referências usam os mesmos pares.

## Correcção da interpretação de #669

Aer é um simulador clássico de circuitos quânticos; a execução não prova entropia quântica física. A API pública nova não propaga o texto da RPC que chama a amostra de “aleatoriedade genuína” ou diz medir aprendizagem demonstrada. Os dados históricos são preservados; esta nota corrige a interpretação, não os números.

Brier = média((p-y)^2). Para y binário, a referência fixa p=0 tem Brier igual à taxa observada; p=0,5 tem sempre Brier 0,25. Não se trata de modelos ajustados aos resultados. Na auditoria de 20/09, 25 pares, todos y=0: modelo 0,0039999844; Aer 0,2500133293; p=0 tem 0. Superar Aer perto de 0,5 não demonstra aprendizagem, boa calibração, vantagem quântica ou desempenho futuro. A comparação é retrospectiva.

Auditoria externa à BD: ligações das 30 linhas recalculadas por `sha256((prev_chain_hash ou 'genesis') + ':' + sample_sha256)`; total de counts igual aos shots de cada linha. Isto verifica as ligações aos hashes registados, não reconstrói cada payload original nem atesta execução em hardware. UPDATE/DELETE bloqueados por triggers foram observados no código; os testes de mutação de #669 não foram repetidos nesta sessão.

## Verificação

`node scripts/verify-calibration-bridge.mjs` cobre referências, zero, dados ausentes/inválidos, limite de cobertura, métodos HTTP e falhas da fonte. `node scripts/verify-horizonte-2030.mjs` passa na base c73e372, já corrigida por outra sessão. Teste de interface usa dados simulados apenas como validação interna.

Publicação final: consultar ora_mudancas desta sessão para commit, deployment, resposta HTTP e observação no navegador. Este ficheiro não antecipa essa confirmação.
