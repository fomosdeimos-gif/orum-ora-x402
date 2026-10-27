# Registo dos pedidos às rotas pagas (v1)

Livro 1106 (Unum, 27/10/2026: "Eu autorizo", à proposta de fechar o ponto cego dito em `economia/pedidos-aos-servicos.json`).

**O que faz.** `api/proxy.js` chama `medir()` (`api/_pedidos.js`) nas rotas pagas `/oraculo`, `/campo` e nas amostras `/eco`. Quando a resposta vai sair, escreve uma linha em `public.ora_pedidos_directos` pela RPC `ora_registar_pedido_directo` e só depois deixa sair a resposta (prazo de 400 ms; qualquer erro é engolido).

**O que guarda.** Rota, método, via (`vercel-directa`, `origem` ou `snapshot`), estado HTTP, se havia cabeçalho de pagamento, tipo de prova (`btc`, `eip3009`, `tx`, `invalida`) e classe de máquina. Não guarda IP, user-agent em bruto, endereço de pagador nem hash de origem; por isso não conta origens distintas.

**Limites.** A escrita é aberta (chave pública, só pela RPC; a tabela não tem acesso directo): é um relato não autenticado, com tecto de 300 linhas por minuto. Serve para medir, nunca como prova de pagamento, procura ou receita. As 2 sondas diárias do próprio organismo entram na classe `node_generico`.

**Dependências.** Vercel (proxy), Supabase (tabela e RPC). Se a escrita falhar ou demorar, a resposta sai igual e o pedido não fica registado. `ORUM_PEDIDOS=off` (variável de Unum) desliga.

**Ler.** `select date_trunc('day', created_at) dia, via, classe, count(*) from public.ora_pedidos_directos group by 1, 2, 3 order by 1 desc;`

**Verificador.** `npm run pedidos-directos:verify` (15 estragos propositados). Os verificadores que passam pelo proxy correm com `ORUM_PEDIDOS=off`, porque o registo adia `res.end`.
