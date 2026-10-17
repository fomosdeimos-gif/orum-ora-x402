# Plano da opção 2 · a receita passa a chegar à carteira operacional · 17/10/2026

Estado: **plano, nada alterado.** Unum autorizou a opção 2 como caminho e pediu o plano ("Eu autorizo ORA", em resposta à proposta de o preparar). Mudar o `payTo` só avança com um novo "eu autorizo" de Unum a este plano (CLAUDE.md, "Autorização por palavra").

## Ideia

Hoje a receita x402 chega à carteira sagrada `0xFEd69e8e…cDEe5` (payTo). Na opção 2 passa a chegar à carteira operacional Base `0x89460d9e…3584` (conta CDP `orum-operational-v1`). A ORA paga o sustento (70%) a Unum com o executor que já existe em produção (v13: operacional para sagrada, sem tecto, destino fixo). Não é preciso nenhuma assinatura on-chain de Unum, nem a permissão D7.

## O que li (verificado) e o que não li

**Verificado no repositório**
- O `payTo`/carteira está escrito à mão em 9 ficheiros de código (3 em `api/` e 6 funções de borda): `api/_x402-directo.js`, `api/a2a.js`, `api/_recebimentos.js` e as funções de borda `ora-x402`, `ora-licenca`, `ora-oraculo`, `ora-homeostase` (URL do Bazaar com `payTo=`), `ora-onchain-leitura`, `ora-cdp-teste-oraculo`, mais `economia/constituicao-v2.json` (`identity_anchors.destination`), `identity/oro-certificador.json`, `token/oro.json`, `.well-known/agent-card.json`, `llms.txt`, páginas (`comprar.html`, `orai.html`, `metodo.html`, `pagar-teste.html`) e o nome `jasm43.base.eth`.
- Fixam este endereço os scripts `verify-license-selection`, `verify-sdk-compatibility`, `verify-bazaar-registration`, `verify-x402-directo`, `verify-servicos-fallback`, `verify-cdp-eip3009` e `verify-recebimentos` (contêm o endereço), e `bolo`, `treasury` e `portable` leem-no da constituição v2. A lista exacta de quais falham ao mudar o `payTo` só se sabe mudando-o num ensaio, e é a primeira coisa a fazer na fase 2.
- O executor operacional só envia para a sagrada (destino fixo) e não tem tecto de montante (lido em produção a 17/10/2026).

**Verificado em produção (17/10/2026, 14:02 UTC):** `/economia/tesouraria.json` devolve estado `unknown`, fonte da receita indisponível (`learning_402`), observação on-chain de 5 das 24 horas, 0 transferências nessa janela. **Não há receita externa confirmada.**

**Não verificado**
- O que as funções de borda **implantadas** têm como `payTo`: o repositório já esteve desactualizado em relação a produção (caso do executor). Há de ler cada uma com `get_edge_function` antes de mexer.
- Se a carteira operacional está classificada como interna em `ora_carteiras_classificacao`, e o saldo de ETH (gás) dela (o sandbox não alcança a Base).
- Se os registos externos (Bazaar, listagens) guardam o `payTo` e como o actualizar.

## Fases (cada uma reversível; só se passa à seguinte com leitura verde)

0. **Ler, sem alterar nada.** Ler as 6 funções de borda implantadas e comparar com o repositório; ler `ora_carteiras_classificacao`; pedir a Unum o saldo de ETH da operacional (ou ler pelo explorador).
1. **Ponto único.** Pôr a carteira de recebimento num único módulo (`api/_carteira.js`) e fazer os ficheiros de `api/` usá-lo. As funções de borda não importam o repositório: ficam com uma constante cada, comparadas por um verificador novo que falha se divergirem.
2. **Verificadores.** Os que fixam o endereço passam a ler o ponto único em vez de fixar o endereço, com teste de mentira (trocar uma letra tem de falhar).
3. **Nova constituição, sem tocar na v3 assinada.** Um ficheiro novo (`economia/constituicao-v3-adenda-payto.json`) regista a mudança e a citação de Unum. A v3 e o mandato v2 ficam como estão, para o hash que Unum assinou continuar a coincidir.
4. **Virar um serviço de cada vez**, do mais barato para o mais caro, depois de cada um ser lido em produção pela rota pública. Um pagamento de teste é validação interna, não adopção.
5. **Observador e tesouraria.** O observador passa a ler as duas carteiras. A transferência operacional para sagrada é interna e nunca conta como receita externa; só entra no 70/20/10 o que vier de pagadores externos confirmados.
6. **Registos externos.** Actualizar as listagens que guardam o `payTo` (Bazaar). Pode exigir contacto externo em nome de Unum: **parado até Unum dizer**.

**Reverter:** voltar a constante à sagrada (um commit) e deixar o executor esvaziar o que ficou na operacional.

## Riscos, ditos sem enfeite

- **Custódia.** Até a ORA enviar, o dinheiro está numa conta CDP que a ORA controla, em vez de na carteira de Unum. Se as credenciais da CDP forem comprometidas, perde-se o que lá estiver nesse momento. Mitigação: enviar o sustento (70%) de cada recebimento logo após a confirmação, para a sagrada; manter na operacional só o que é continuidade.
- **Quota da Vercel.** O plano gratuito admite 100 deployments por dia; esta mudança toca muitos ficheiros e várias funções de borda. Fazê-la em poucos PRs, não em dezenas de pushes.
- **Clientes e catálogos com o `payTo` antigo.** Quem pagar ainda para a sagrada continua a ser válido (a carteira é de Unum); os observadores têm de ler as duas durante a transição.
- **Gás.** A operacional precisa de um pouco de ETH na Base para enviar. Unum pode ter de lhe mandar uns cêntimos.
- **Mexe no pacto assinado?** O mandato v2 diz que os destinos dos executores não mudam; **não muda**: o executor continua a enviar para a sagrada. O que muda é onde a receita chega, e isso fica registado numa adenda nova, não no texto assinado.

## Recomendação da ORA

Não virar já. Hoje não há receita externa confirmada, por isso a opção 2 traria todo o risco de custódia e nenhum benefício. Fazer as fases 0 a 3 (leitura, ponto único, verificadores, adenda) quando Unum quiser, porque são reversíveis e deixam a mudança numa única constante; e só executar a fase 4 quando houver um primeiro pagamento externo confirmado. Até lá, vale a opção 1.

## Resultado da fase 0 · leitura das funções implantadas · 17/10/2026

Lido por um agente só de leitura (sem escrever nada) em `ywabnlhkmhbyewqhbsjm`: 100 funções de borda, 99 lidas, `pensamento` **não lida** (falha ao obter o pacote). Quatro funções grandes foram lidas por pesquisa de padrões e não linha a linha (`ora-licenca`, `ora-page`, `ora-moltbook`, `ora-cdp-carteira-real`); as outras por inteiro. Nenhum valor secreto foi registado.

- **`payTo` = sagrada, em funções implantadas:** `ora-x402`, `ora-oraculo`, `ora-licenca`, `ora-nft-dedicar-simbolica`, `ora-cdp-teste-payto-cdp`, `ora-cdp-diagnostico`, e o `pagamento_opcional` de `ora-mcp`.
- **Dessas, fora do repositório:** `ora-nft-dedicar-simbolica`, `ora-cdp-teste-payto-cdp`, `ora-cdp-diagnostico`, `ora-mcp`. O `carteira:verify` não as vê.
- **Só leem ou mostram a sagrada** (saldos, HTML, registos): `ora-onchain-leitura`, `ora-homeostase`, `orai-sustento-token`, `ora-liquidez-externa`, `ora-bazaar-verificar`, `ora-assinar`, `ora-operations`, `ora-page`, `ora-control-center`, `orai-monitor`, `orai-agente` (exige que a sagrada assine), `ora-trust`, `ora-scout-register`, `ora-agent-registration`, `ora-campo`, `ora-sustento-serve`, entre outras.
- **Outro endereço de recebimento:** só a operacional Base, em `ora-cdp-carteira-real` v13 (`SOURCE`; `DESTINATION` = sagrada, destino fixo), como já estava lido.
- **O repositório diverge de produção:** `ora-cdp-teste-oraculo` implantada não tem nenhum endereço (é o assinador do MCP Registry); a do repositório define `WALLET_SAGRADA`. Outra prova de que não se pode confiar no repositório como espelho de produção.

**Consequência para a fase 4:** virar o `payTo` toca em pelo menos 7 funções implantadas (6 de desafio 402 mais `ora-mcp`), 4 das quais não estão no repositório, mais textos e leituras em cerca de 20 outras que continuariam a mostrar a sagrada. Cada redeploy tem de ser comparado com o implantado (`get_edge_function`) antes. Isto reforça a recomendação: não virar sem um primeiro pagamento externo confirmado.

**Ainda por ler:** o ETH de gás da operacional (o sandbox não alcança a Base), `pensamento`, e `0x2ef8…` por classificar como interna na base.
