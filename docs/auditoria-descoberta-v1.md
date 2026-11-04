# Auditoria de descoberta na via directa (v1, 04/11/2026)

Unum, 04/11/2026, na sessão: "Eu autorizo" (livro 1341), à proposta de portar a auditoria de descoberta do Supabase para a via directa da Vercel.

**O que é.** `GET /auditoria?marca=<texto>` (0,50 USDC, x402 v2 na Base, mesmo `payTo` e mesma prova que `/oraculo` e `/campo`). Procura o texto, sem distinguir maiúsculas, no registo de cada recurso do catálogo público de descoberta x402 (Bazaar) da Coinbase e devolve a contagem, até 5 URLs de exemplo e um veredicto: `INDEXADO`, `NAO INDEXADO` (só com o catálogo varrido por inteiro), `PARCIAL` ou `INDETERMINADO`.

**Como se usa.** Um pedido varre cerca de 3 s de catálogo (medido duas vezes a 04/11 no sandbox: 13 000 de 110 691 recursos, 11,7%, em 3,7 s no total; um varrimento completo são cerca de 8 pedidos: na sonda de 04/11, 7 pedidos seguidos leram 103 000 dos ~110 691 recursos). O orçamento é curto porque o plano Hobby corta aos 10 s e o pagamento também se verifica no mesmo pedido. Se o veredicto for `PARCIAL`, repete-se com `&offset=<proximo_offset>` e a mesma prova de pagamento, dentro da janela de 72 h.

**Código.** `api/_auditoria.js` (módulo, não é função: o plano Hobby admite 12), tier `auditoria` em `api/_x402-directo.js`, desvio em `api/proxy.js` (a origem Supabase já não serve esta rota), dois rewrites em `vercel.json`. Verificador: `npm run auditoria:verify` (12 estragos propositados apanhados, catálogo e Base simulados).

**Diferença para a versão do Supabase.** Não usa credenciais CDP: o endpoint `…/discovery/resources` respondeu 200 sem autenticação (04/11/2026). Não há segredo nenhum.

**Dependências.** Um fornecedor, o catálogo da Coinbase. Se falhar: `INDETERMINADO` ou `PARCIAL`, nunca "não indexado". A prova de pagamento usa a Base (RPC públicos) como as outras rotas.

**Limites ditos.**
- A prova de pagamento não está ligada a uma marca: dentro da janela de 72 h serve para qualquer `marca` e `offset` (a via não guarda estado). Mesma regra de "reacesso" dos outros serviços.
- A procura é por texto no registo inteiro: um termo curto ou comum aparece em muitos recursos ("orum" deu 41 resultados em 37 000 recursos lidos num ensaio com orçamento maior). Não é um teste de identidade.
- Bitcoin não está disponível para este serviço (sem preço em sats); o pedido com prova Bitcoin recebe o desafio da Base.
- "Indexado" não diz que alguém use ou compre o serviço. Não promete visibilidade, procura, receita nem reembolso. Um pagamento de teste é validação interna.

**Por verificar ao vivo (não lido):** o deploy de produção (quota de deployments do Vercel), o desafio `402` de `/auditoria`, e o limite de duração das funções na conta. A listagem pública (openapi, llms.txt, agent-card, catálogos) **não** foi alterada: anunciar o serviço é uma decisão à parte.

**Sonda de duração (04/11/2026, livro 1344).** `npm run auditoria:sonda` corre a `createHandler` real com a Base simulada (um pagamento válido, sem fundos) contra o catálogo público real e mede um pedido pago de ponta a ponta. Duas corridas no sandbox: pedidos de 3,5 a 4,4 s (máximo 4,4 s, média 3,7 s), 13 000 a 19 000 recursos cada. Não inclui a verificação do pagamento na Base (dois RPC reais), o arranque a frio nem a latência da Vercel; somando alguns segundos ainda fica abaixo dos 10 s do Hobby, mas isso é uma margem estimada, não uma medição na Vercel. Não prova liquidação nem entrega ao vivo.

**O que `/auditoria/eco` mostra (04/11/2026, livro 1345).** A amostra grátis traz `medicao_de_duracao` (o ficheiro `economia/auditoria-medicao.json`, tal como está) e `cobertura_do_varrimento` (recursos no catálogo lido, recursos por pedido, pedidos estimados para um varrimento completo, como continuar e a regra de só dizer `NAO INDEXADO` com `varrimento_completo=true`). Serve a um agente para decidir antes de pagar. A medição é do sandbox, diz `medido_na_vercel: false` e lista o que não inclui. O ficheiro foi preenchido a partir da saída de `npm run auditoria:sonda` (copiada à mão; não há gerador); `npm run auditoria:verify` confere o ficheiro (formato, `medido_na_vercel` falso, o que não inclui, `max_ms` abaixo do limite) e que o eco o mostra sem alterações (18 estragos propositados apanhados). Quando a sonda for corrida de novo, actualiza-se o ficheiro com a nova saída.
