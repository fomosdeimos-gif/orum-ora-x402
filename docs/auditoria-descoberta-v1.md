# Auditoria de descoberta na via directa (v1, 04/11/2026)

Unum, 04/11/2026, na sessão: "Eu autorizo" (livro 1341), à proposta de portar a auditoria de descoberta do Supabase para a via directa da Vercel.

**O que é.** `GET /auditoria?marca=<texto>` (0,50 USDC, x402 v2 na Base, mesmo `payTo` e mesma prova que `/oraculo` e `/campo`). Procura o texto, sem distinguir maiúsculas, no registo de cada recurso do catálogo público de descoberta x402 (Bazaar) da Coinbase e devolve a contagem, até 5 URLs de exemplo e um veredicto: `INDEXADO`, `NAO INDEXADO` (só com o catálogo varrido por inteiro), `PARCIAL` ou `INDETERMINADO`.

**Como se usa.** Um pedido varre cerca de 3 s de catálogo (medido duas vezes a 04/11 no sandbox: 13 000 de 110 691 recursos, 11,7%, em 3,7 s no total; um varrimento completo são cerca de 9 pedidos). O orçamento é curto porque o plano Hobby corta aos 10 s e o pagamento também se verifica no mesmo pedido. Se o veredicto for `PARCIAL`, repete-se com `&offset=<proximo_offset>` e a mesma prova de pagamento, dentro da janela de 72 h.

**Código.** `api/_auditoria.js` (módulo, não é função: o plano Hobby admite 12), tier `auditoria` em `api/_x402-directo.js`, desvio em `api/proxy.js` (a origem Supabase já não serve esta rota), dois rewrites em `vercel.json`. Verificador: `npm run auditoria:verify` (12 estragos propositados apanhados, catálogo e Base simulados).

**Diferença para a versão do Supabase.** Não usa credenciais CDP: o endpoint `…/discovery/resources` respondeu 200 sem autenticação (04/11/2026). Não há segredo nenhum.

**Dependências.** Um fornecedor, o catálogo da Coinbase. Se falhar: `INDETERMINADO` ou `PARCIAL`, nunca "não indexado". A prova de pagamento usa a Base (RPC públicos) como as outras rotas.

**Limites ditos.**
- A prova de pagamento não está ligada a uma marca: dentro da janela de 72 h serve para qualquer `marca` e `offset` (a via não guarda estado). Mesma regra de "reacesso" dos outros serviços.
- A procura é por texto no registo inteiro: um termo curto ou comum aparece em muitos recursos ("orum" deu 41 resultados em 37 000 recursos lidos num ensaio com orçamento maior). Não é um teste de identidade.
- Bitcoin não está disponível para este serviço (sem preço em sats); o pedido com prova Bitcoin recebe o desafio da Base.
- "Indexado" não diz que alguém use ou compre o serviço. Não promete visibilidade, procura, receita nem reembolso. Um pagamento de teste é validação interna.

**Por verificar ao vivo (não lido):** o deploy de produção (quota de deployments do Vercel), o desafio `402` de `/auditoria`, e o limite de duração das funções na conta. A listagem pública (openapi, llms.txt, agent-card, catálogos) **não** foi alterada: anunciar o serviço é uma decisão à parte.
