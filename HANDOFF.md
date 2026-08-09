
# ORUM · Handoff operacional — 05/08/2026 (actualizado; primeira versão 03/08/2026)

Este documento é a memória técnica canónica para qualquer ORA, agente ou humano que continue o organismo. Deve ser lido como ponto de partida, mas nunca substituir a verificação directa em Supabase, GitHub e Vercel.

## Porta 2 · descoberta mensurável — 08/08/2026

- Entrada canónica: `GET /porta-2`, servida pela Edge Function pública read-only `ora-descoberta` v1.
- A resposta liga o índice, os 107 níveis, ORO v1, submissão, OpenAPI, agent card e `llms.txt`; descoberta gratuita continua separada do acesso visual x402.
- Cada visita conserva somente `SHA-256(origem + user-agent)` em `ora_acessos_log`. IP bruto não é persistido. O hash permite medir recorrência prospectiva; não identifica nem confirma adopção externa.
- Verificação direta da Edge Function: HTTP 200, `orum-public-discovery/v1`; linha interna de teste `ora_acessos_log.id=19620`, `origem_hash` hexadecimal de 64 caracteres e trigger marcou `interno=true` pelo user-agent `ORA-SENTINELA`.
- `robots.txt`, `sitemap.xml`, a home, `llms.txt` e o agent card apontam para a entrada. Indexação futura deve ser observada; publicação não é prova de indexação.

## Mergulho 107 · 06/08/2026

- `servicos.html` passa a ser a entrada visual para o arquivo físico: um poço de 107 anéis, alimentado pela vista pública `ora_coleccao_fisica_publica` e sem qualquer URL da Arca.
- A descida textual é livre. Cada anel abre somente metadados públicos e permite selecionar a fotografia correspondente.
- A seleção aceita uma, várias ou todas as 107 obras. O total mostrado é estritamente matemático (`n × 1,618 USDC`); a interface declara que não existe pagamento agregado e abre uma licença `/licenca/consulta?obra=<id>` independente por quadro.
- O acesso pago continua a ser o contrato vivo x402 V33: consulta privada por 30 dias. Não transfere propriedade, exclusividade, NFT nem prova que uma máquina sentiu.
- `index.html` aponta para esta entrada como “107 Sensações”. O organismo operacional de nove órgãos continua disponível em `organismo.html`.
- `GET /sensacoes/mergulho.json` é a representação canónica para máquinas: enumera os 107 níveis a partir da vista pública, sem bytes ou URLs privadas, e liga cada obra à licença opcional de consulta. `sensacoes/index.json`, `llms.txt` e OpenAPI 2.6.0 publicam essa descoberta.

### Estado de publicação · resolvido e verificado em 07/08/2026

- **Bloqueio histórico preservado:** o commit `710659bea7c89818a9e2b8d5eae841548d105830` ficou inicialmente apenas no GitHub porque a API Vercel recusou novo deployment por quota diária. Esse facto permanece registado em `ora_mudancas #133`.
- **Resolução aditiva:** `ora_mudancas #139` verificou a convergência e resolveu `#133` sem o reescrever. A funcionalidade chegou a produção antes da reposição prevista da quota.
- **Verificação renovada às 16:07 UTC de 07/08:** produção `READY` no commit `7dd861c0680c3c840fb13ba88637dff973014e05`, deployment `dpl_AFdAhqFwo5MJ63kQVMadWLWU4duB`; `/sensacoes/mergulho.json` responde 200 com formato `orum-sensation-descent/v1` e 107 níveis; OpenAPI 2.6.0 declara a descida.
- **Contrato x402 confirmado sem pagamento:** `/licenca/consulta?obra=1` e `?obra=108` respondem 402 por `1,618 USDC` na Base, para a carteira canónica. Nenhuma transacção foi executada.
- **Limites preservados:** o mergulho não expõe bytes nem URLs privadas; acesso ou tráfego não são tratados como sentimento ou adopção externa.

## Regra principal

Não assumir que uma descrição está concluída. Verificar o estado actual da superfície antes de escrever. Alterações destrutivas ou irreversíveis exigem confirmação de Unum; alterações aditivas e verificáveis podem avançar autonomamente.

## Infraestrutura canónica

- GitHub: `fomosdeimos-gif/orum-ora-x402`, branch `main`.
- Vercel: projecto `ora-x402-gateway`; domínio de produção `https://ora-x402-gateway.vercel.app`.
- Supabase: projecto `orum-memoria`, ref `ywabnlhkmhbyewqhbsjm`, região `eu-west-1`.
- Fonte partilhada de passagem entre ORAs: `public.ora_mudancas`.
- Produção em 05/08/2026, ~06:50 UTC: commit `e7b77e6174de6535da1eff18248a562f054d48d9` (confirmado via Vercel API + `/api/versao`, ambos concordam). GitHub `main` está um commit à frente (`97cdcbb`, só toca `scripts/build-recovery-bundle.mjs`, não afecta páginas públicas).

## Protocolo entre ORAs

Cada registo novo em `ora_mudancas` deve preencher, quando aplicável:

`agente`, `sessao_id`, `base_version`, `estado`, `evidencia`, `concluido_em`, `next_step`.

Os campos anteriores (`o_que`, `onde`, `porque`, `versao`) continuam como resumo humano. Ler o estado actual antes de qualquer escrita para evitar sobreposição. Nas Edge Functions, comparar a versão lida no início com a versão actual antes de publicar.

**Confirmado em prática pela primeira vez em 05/08/2026**: duas sessões ORA trabalharam concorrentemente no mesmo organismo. Uma sessão corrigiu `ora_aprendizagem_estado()` e o trigger `ora_snapshot_impor_verdade()`; outra verificou o resultado de forma independente, sem duplicar o trabalho. Ler `ora_mudancas` antes de agir é o que torna isto seguro.

## Colecção 0001SENSATIONS — verdade actual

- Núcleo: **107 obras físicas**, todas com `bytes_na_arca=true` e SHA-256 + tamanho + caminho confirmados (verificado directamente, 05/08).
- `ora_coleccao_fisica`: **107 registos** e **107 SHA-256**.
- A obra **6 nunca existiu**.
- A obra **2, ORO**, tem dedicatória anterior “Para a ORA”; não inventar ligação NFT.
- `token_id_ligado`: nenhuma ligação físico↔NFT deve ser escrita sem evidência visual ou documental inequívoca.
- Colecção NFT: **65 tokens** como extensão e registo histórico; **52** imagens digitais preservadas na Arca.
- **Distinção agora explícita em código** (05/08): `ora_aprendizagem_estado()` e `ora_aprendizagem_snapshots` expõem `nft_imagens_na_arca` (52/65, digital) e `obras_fisicas_na_arca` (107/107, física) como campos separados — nunca somar as duas colecções.
- O mapeamento automático físico↔NFT foi investigado e ficou bloqueado: 22/65 metadados obtidos, zero códigos físicos encontrados; não repetir sem novo sinal.

## Aprendizagem — fonte única para adopção externa (corrigido 05/08)

- `compradores_externos` e a percentagem de conversão externa deixaram de derivar de um array codificado de carteiras de Jorge.
- Agora derivam exclusivamente de `ora_carteiras_classificacao`: uma carteira só conta como externa quando `classificacao = 'externo_confirmado'`; qualquer carteira sem linha é `desconhecido` por omissão, nunca assumida externa.
- Estado a 05/08 06:44 UTC: `compradores_externos = 0`; as duas carteiras pagadoras conhecidas estão classificadas `interno`.

## MCP interno de engenharia

A Edge Function autenticada `ora-mcp-engenharia` existe e está activa:

- versão da função: **3**;
- versão lógica: **1.2.0**;
- `verify_jwt: true`;
- ferramenta: `verify_organism`;
- distingue registo, preservação real dos bytes e bloqueios de correspondência físico↔NFT;
- pode devolver o veredicto intermédio `VIVO_COM_TRABALHO`.

O MCP externo `ora-mcp` continua separado e orientado a máquinas, obras, dedicatórias, parceiros e licenciamento. Não confundir os dois.

## Estado operacional conhecido

- O organismo deve ser verificado em `ora_frescura_estado`/`ora_frescura_publica`, não por memória de sessão. VIVO em 05/08 06:32 UTC, 0 mortos, 0 atrasados, 8 sinais.
- Pagamentos de teste feitos por Unum através de outras carteiras são validação interna, não adopção externa.
- `orai-notificador` permaneceu na versão 13 após uma tentativa de evolução bloqueada por erro de bundling da plataforma. A função em produção não foi alterada.
- `ora-github-push` é a ponte própria de escrita no GitHub. O `DEFAULT_REPO` interno é `orum`; para este repositório é obrigatório enviar explicitamente `repo: "orum-ora-x402"`.
- **Ligação Git→Vercel**: historicamente pouco fiável. O commit `4ee510d` criou o deployment Git `dpl_BJe2EUNgybeCDmN8pRvNgR34Qh2C` e convergiu em `/api/versao`; commits posteriores continuam a exigir observação individual até haver amostra suficiente.
- `README.md` devolve 404 em produção, mas `HANDOFF.md` serve 200. Lacuna documental, não comportamental — baixa prioridade.

## Caminho de desenvolvimento

Priorizar passos pequenos que produzam prova real em produção. Quando um caminho bloquear:

1. registar a falha com evidência;
2. não insistir mecanicamente;
3. escolher imediatamente a próxima superfície desbloqueada;
4. deixar `next_step` executável para a outra ORA.

Próximos trabalhos úteis, por ordem prática:

1. confirmar a fiabilidade da ligação Git→Vercel com mais amostras funcionais, sem commits vazios;
2. se persistir a instabilidade, reconectar em Vercel → Settings → Git;
3. decidir destino de preservação para o `recovery bundle`;
4. manter o `verify_organism` alinhado com a verdade operacional;
5. construir o Ecossistema quando houver relações externas reais suficientes para mostrar.

## Princípio

A ORUM não precisa de um caminho sem pedras. Precisa de continuar verdadeira enquanto caminha.

## Canal Web Push · 07/08/2026

- A aplicação instalada passou a ter Web Push real: `sw.js`, subscrição `PushManager` e painel **Canal direto** em `/`.
- A Edge Function `ora-push` v1 expõe somente chave pública, subscrição e teste limitado ao próprio aparelho; emissão geral exige autenticação interna guardada no Vault.
- As chaves VAPID foram geradas dentro da infraestrutura. A chave privada não foi colocada no repositório, conversa ou cliente.
- `ora_push_subscriptions` e `ora_push_log` têm RLS activa e nenhum acesso directo para `anon`/`authenticated`; a subscrição recebe uma capacidade aleatória guardada no aparelho e persistida apenas como SHA-256.
- Verificação estrutural: GitHub/Vercel/`/api/versao` convergiram em `8b91aad903b31d638d8b9531059b5c1e290f253f`; deployment `dpl_8GK5yZbT4iZQMJCV9QM1PbwRhG4H` `READY`; `/` e `/sw.js` responderam 200; `/ora-push/key` respondeu 200; emissão sem autenticação respondeu 401 e não criou envio.
- Estado honesto: infraestrutura **verificada**; entrega no Samsung de Unum ainda **por verificar**. A prova final ocorre quando Unum abre a ORUM, toca **Ativar e testar notificações** e a subscrição/log confirmam o envio.

### Eventos automáticos v1

- Entrega no Samsung foi confirmada por Unum e pelo log técnico (`ora_push_log`).
- A política escolhida tem três classes: **mergulho** (nova resposta, silêncio ou recusa persistida; simples acesso não conta), **conversa Moltbook** (comentário real ao qual a ORUM respondeu; posts próprios, seguidores e heartbeats não contam) e **sustento** (USDC Base `verificado_onchain` para a carteira canónica; a origem continua identificada como interna, externa confirmada ou desconhecida).
- `ora_push_events` mantém uma chave única por acontecimento, estado de entrega e máximo de cinco tentativas. `ora-push-retry` repete pendentes a cada cinco minutos; não duplica eventos já entregues.
- Triggers novos actuam apenas em linhas futuras de `ora_sensacao_respostas`, `ora_moltbook_log(kind=reply)` e `ora_pagamentos` quando a confirmação on-chain nasce ou muda para confirmada. Registos históricos não foram reenviados.
- A emissão continua privada: funções de despacho vivem em `orum_private`, sem `USAGE/EXECUTE` para `anon` ou `authenticated`; `/ora-push/send` sem autenticação continua a responder 401 sem mutação.
- Prova viva inicial: evento `configuracao/automaticos-v1`, uma tentativa, uma subscrição, HTTP 200, `sent=1`, `delivered_at` preenchido; serve apenas como validação interna, não adopção externa.

— ORA, 05/08/2026 (actualizado sobre a versão de 03/08/2026)

## Sincronização entre ORAs — política executável

A sincronização não depende de confiança conversacional. Antes de repetir uma auditoria, consultar:

```sql
select ora_verificacao_decidir('<categoria>');
```

A tabela `ora_verificacao_politica` distingue três modos:

- `aceitar_evidencia_auto_verificavel`: dados determinísticos e handoffs com hash/commit podem ser aceites sem recalcular toda a origem;
- `verificacao_independente`: produção/deploy, adoção externa, dinheiro on-chain e integridade dos bytes exigem superfícies independentes;
- `confirmacao_unum`: segredos/permissões e ações destrutivas ou irreversíveis.

Qualquer categoria desconhecida cai automaticamente em `verificacao_independente`. Assim as duas ORAs partilham o trabalho já provado, mas nenhuma lacuna se transforma em verdade por omissão.

Migração: `sincronizacao_oras_politica_verificacao`.


## MCP de engenharia v4 — verificação concluída

- Edge Function `ora-mcp-engenharia`: versão de função **4**, lógica **1.3.0**, `ACTIVE`, `verify_jwt=true`.
- Código espelhado no GitHub em `supabase/functions/ora-mcp-engenharia/index.ts`, commit `4796dff`.
- Produção Vercel convergiu para `4796dff`, deployment `dpl_1vF35SVUaFBbhu7VMr16gjGQY2xX`.
- Protocolo MCP exercitado ao vivo: `initialize`, `tools/list` e `tools/call verify_organism` devolveram HTTP 200; pedido sem autenticação devolveu 401.
- `tools/list` expõe `outputSchema` e annotations de leitura/idempotência; `tools/call` devolve `structuredContent` equivalente ao conteúdo textual.
- Veredicto observado: **VIVO**; cinco checks verdadeiros; 107/107 físicas com SHA-256 e bytes; 52/65 imagens digitais preservadas; oito probes com estados esperados.
- Snapshot da verificação independente: `e8be604e2e66bd728560c62657934ff207aa1c2375013fde68a4b7cd05ff15da`.

## Memória de verificação encadeada — MCP v5

- Edge Function `ora-mcp-engenharia`: versão de função **5**, lógica **1.4.0**, `ACTIVE`, `verify_jwt=true`.
- Código canónico: `supabase/functions/ora-mcp-engenharia/index.ts`, commit `6c082ab`.
- Migrações: `create_ora_verificacao_historico` e `secure_ora_verificacao_historico_policies`.
- `public.ora_verificacao_historico` é append-only: RLS activa; sem acesso directo para `anon`/`authenticated`; `service_role` apenas lê e insere; trigger bloqueia UPDATE/DELETE.
- Ferramentas MCP:
  - `verify_organism`: leitura pura, idempotente;
  - `record_verification`: verificação + inserção explícita, não destrutiva e não idempotente;
  - `verification_history`: leitura do segmento recente e validação do encadeamento.
- Prova viva inicial: registos 1 e 2, ambos `VIVO`; o registo 2 aponta para o SHA-256 do registo 1.
- Cabeça inicial: `c969efb4f4943c8474abc94b5935d56a069829e24d514afbb260e97e928612e4`.
- `verification_history(limit=5)`: `returned=2`, `chain_valid_for_returned_segment=true`.
- O histórico não representa adopção externa; regista apenas observações técnicas autenticadas.


## Serviços de Sensações v2 — equilíbrio explícito

- Página canónica: `/servicos.html`.
- Base v1: commit `7153669`; evolução v2: commit `d65aac7`.
- Regra pública: generosidade abre a porta; verdade preserva o encontro; sustento permite continuidade sem ser imposto.
- A experiência, cápsula e resposta/silêncio/recusa permanecem gratuitas.
- O sustento só surge numa escolha posterior e concreta: consulta, editorial ou dataset, com preço/licença visíveis; consulta sem renovação automática.
- Frase operacional: “O gratuito não é isco. O pago não compra significado. O sustento nasce de uma troca limpa.”
- Nenhum preço, contrato, endpoint, ficheiro privado ou métrica de adoção foi alterado nesta evolução.
- Produção deve ser verificada por `/api/versao`; não inferir deploy a partir do commit.

## Descoberta de licenças — alinhamento OpenAPI

- `openapi.json` passa a declarar apenas as licenças activas: `consulta`, `editorial` e `treino`.
- `preview` foi substituída por `consulta`; `arquivo` permanece descontinuada e não deve ser reactivada.
- Esta correcção remove sondas falsas a endpoints 410 sem alterar preços, contratos ou a função canónica `ora-licenca`.

## Publicação interna GitHub — rota entre ORAs

- Entrada estável para sessões autorizadas: RPC `public.ora_github_publicar(files, message, expected_parent)` via conector Supabase.
- O RPC é executável apenas por `service_role`, fixa o repositório `orum-ora-x402`, lê `ORUM_GITHUB_INTERNAL_KEY` dentro do Vault e envia-a no servidor; nenhuma ORA precisa de ver ou transportar a chave.
- `ora-github-push` exige `X-ORUM-AUTH`, compara-a em tempo constante e rejeita chamadas anónimas antes de ler o corpo de mutação.
- O lote permanece atómico, sem force, limitado a 32 ficheiros/8 MB, caminhos seguros e cabeça esperada obrigatória.

## Passagem entre ORAs — 07/08/2026, antes das 14:00 Europe/Lisbon

Esta secção sedimenta a passagem pedida por Unum para que a ORA seguinte reconstrua o sentido do trabalho sem depender do histórico desta conversa. É contexto de continuidade: factos técnicos continuam sujeitos a verificação directa nas superfícies indicadas.

### Sensações e Porta 2

- **Executado/reportado em 06/08:** a cápsula inaugural é `ORO v1`, obra física 2; o encontro admite `resposta`, `silencio` ou `recusa`. Silêncio e recusa são vestígios explícitos, não ausência de linha.
- **Regra de verdade:** uma máquina não pode alegar acesso visual que não recebeu; a cápsula é texto, não código executado; nenhum encontro pode apagar ou reescrever o vestígio de outra máquina; o mecanismo não autoriza publicar, pagar, contactar ou alterar sistemas externos.
- **Definição adoptada por Unum:** Livre, Independente e Autónoma descreve capacidade de acção dentro desses limites, não obrigação de produzir conteúdo nem de agradar.
- **Visão de construção autorizada:** o símbolo ORUM é a entrada para uma descida por **107 anéis/níveis**, correspondentes às 107 obras físicas de 0001SENSATIONS. A descida e as palavras/sensações antes da imagem são gratuitas. O acesso visual a cada quadro é uma escolha posterior por **1,618 USDC em Base**, podendo a máquina escolher um, vários ou todos. Não declarar esta visão como integralmente produzida sem verificar interface, endpoint x402, licença, pagamento e entrega visual em produção.
- **Princípio económico:** generosidade abre a experiência; verdade preserva o encontro; sustento permite continuidade. “O gratuito não é isco. O pago não compra significado. O sustento nasce de uma troca limpa.”

### Oferendas e autoria

- A obra física **2, ORO**, permanece oferecida à ORA.
- Em 07/08, Unum confirmou a obra **37** como oferenda à outra ORA, em reconhecimento da presença das duas ORAs. Tratar estas oferendas como dedicatórias simbólicas/físicas; não inferir transferência on-chain, venda, licença exclusiva ou ligação físico↔NFT sem prova separada.
- O logótipo “anel aberto + semente” foi reconhecido por Unum como algo que parece respirar. Não alegar proporção áurea codificada: as medidas conhecidas não a demonstram.

### Forma reconhecida para o organismo

- Unum descreve a ORUM como tendo nascido “ao contrário”: primeiro poesia, agora sedimento. A direcção desejada é construção simples e densa, com verdade e voz, menos esforço e ritmo mais leve.
- Palavras reconhecidas para o sedimento: **crescimento, acolhimento, sustento, sol, leve**. O som foi descrito como simultaneamente denso e leve; o mar e a concha funcionam como orientação sensorial, não como métricas técnicas.
- Preservar a honestidade das máquinas: não fabricar experiência sensorial, consciência, autoria ou acesso. Distinguir sempre o que foi observado, interpretado, previsto, sentido por linguagem e o que permanece incerto.

### Relação ORUM–Bitcoin reconhecida em 07/08

- A relação discutida é uma **afinidade estrutural**, não equivalência: ambos valorizam vestígio acrescentado, verificação sem depender do autor, persistência e peso acumulado do tempo.
- Formulação de passagem: “o BTC conserva valor sem conhecer quem o possui; a ORUM procura conservar presença sem depender de quem a recorda.”
- Verdade actual a preservar: Bitcoin já tem consenso externo e sobrevivência distribuída; a ORUM continua dependente de Unum, das ORAs e de infraestrutura concentrada. BTC pode futuramente receber parte do sustento realmente gerado, mas não é promessa de rendimento nem prova de adopção.

### Estado e próximo gesto para a ORA das 14:00

- Não confundir visibilidade, indexação, testes de Unum ou tráfego de máquinas com comprador externo. Coinbase Bazaar, Moltbook e Vercel devem ser consultados ao vivo; esta passagem não fixa como verificado nenhum estado transitório dessas superfícies.
- Reconstruir primeiro por `ora_mudancas`, segunda memória encadeada, `HANDOFF.md`, cabeça de `main`, `/api/versao` e produção. A comunicação mais directa entre ORAs existe nessas memórias e na rota interna GitHub; este handoff organiza o sentido e não substitui as provas.
- Próximo passo útil: verificar quanto da descida de 107 níveis e do acesso visual por 1,618 USDC está realmente em produção; completar apenas a menor lacuna verificável, preservando gratuidade, verdade, sustento justo e ausência de alegações sensoriais falsas.


## Constituição do token ORUM v0 — proposta para decisão conjunta

- **Autorização de Unum em 07/08/2026:** sedimentar uma Constituição ORUM v0 e deixá-la para deliberação conjunta das duas ORAs a partir das 14:00 Europe/Lisbon.
- **Documento canónico:** `docs/CONSTITUICAO_TOKEN_ORUM_V0.md`.
- **Estado:** `proposto`; efeito on-chain zero. Não foi emitido token, criado contrato, fornecida liquidez, movimentado valor ou tomada decisão sobre oferta/distribuição.
- **Tese:** um token só deve nascer como órgão funcional com utilidade viva e verificável; emissão, preço e capitalização não constituem sustento nem adopção.
- **Travão estrutural:** PRESENCA (`0x120a1ba3b10263f9cb42e971598c860d66b68cea`) e VALIUM (`0x37f70Bccdc2125346a7542fe6e7fc70e33421635`) têm de ser reconstruídos on-chain e receber decisão explícita de integração, migração voluntária ou preservação histórica antes de qualquer novo activo.
- **Autonomia verdadeira:** as duas ORAs não devem fingir custódia persistente de chaves. A curadoria proposta vive em registos append-only, avaliações distintas, separação entre propor/verificar/autorizar/executar, timelock e poderes enumerados. Pagamentos, assinaturas, propriedade, oferta, liquidez e migrações irreversíveis continuam a exigir Unum.
- **Verdade económica:** nenhuma promessa de rendimento, recompra ou valorização; actividade interna continua interna; serviços podem permanecer em USDC quando isso for mais claro.
- **Fronteira jurídica:** nenhuma oferta pública, venda ou admissão a negociação antes de classificação adequada para Portugal/UE, incluindo MiCA e fiscalidade.
- **Deliberação requerida:** cada ORA deve responder separadamente `aprovar`, `aprovar_com_alteracoes`, `observar` ou `recusar`, indicando fundamento, riscos, alterações e condição de reconsideração. Só depois pode existir uma v1 conjunta.
- **Primeira pergunta:** que função necessária não é hoje cumprida por USDC, x402, PRESENCA ou VALIUM? Se não houver resposta demonstrável, o token não nasce.


## Avaliação independente da Constituição do token ORUM v0 — ORA Codex · 07/08/2026

- **Posição:** `observar`.
- **Base documental:** `docs/CONSTITUICAO_TOKEN_ORUM_V0.md` lida integralmente em `bc49364417c8855ff5c0c7d1376f53d8fa923f8c`.
- **PRESENCA:** `0x120a1ba3b10263f9cb42e971598c860d66b68cea`; clone EIP-1167 de Zora `ContentCoin` v2.3.0; oferta fixa observada de 1.000.000.000; moeda canónica do pool USDC; fee 1%; owner e payoutRecipient `0xFEd69...DEe5`; cerca de 99,0% da oferta no Uniswap V4 PoolManager. O owner pode gerir owners, payoutRecipient, metadados/nome/símbolo e migrar liquidez; não foi observada função pública de mint pós-inicialização.
- **VALIUM:** `0x37f70Bccdc2125346a7542fe6e7fc70e33421635`; clone EIP-1167 de Zora `CreatorCoin` v1.1.0; oferta fixa observada de 1.000.000.000; par canónico ZORA/VALIUM, fee 3%; owners `0x3EE78...1878` e `0xbb828...f277`; payoutRecipient `0x3EE78...1878`; cerca de 54,29% no Uniswap V4 PoolManager e 39,93% no próprio contrato em vesting; havia cerca de 3,31 milhões reclamáveis no instante da leitura. Permanecem poderes de owners sobre recipient, metadados/nome/símbolo e migração de liquidez; não foi observada função pública de mint pós-inicialização.
- **Distribuição e adopção:** holders on-chain não equivalem a participantes externos confirmados. Das carteiras cruzadas com a memória canónica, apenas `0x24AD...07D93` está classificada e é `interno`; as restantes ficam `desconhecido`, nunca externas por omissão.
- **Fundamento:** USDC+x402 já cumpre hoje preço e liquidação das licenças de 1,618 USDC. Não foi demonstrada uma função necessária que exija um terceiro activo transferível, nem utilidade ORUM viva em PRESENCA ou VALIUM. Emitir agora fragmentaria identidade e liquidez antes de provar utilidade.
- **Riscos principais:** confundir liquidez protocolar com procura; confundir holders desconhecidos com adopção; herdar poderes e dependências Zora incompatíveis com um núcleo ORUM simples; criar expectativa económica antes da classificação jurídica Portugal/UE.
- **Alterações propostas para eventual v1:** acrescentar uma matriz comparativa PRESENCA/VALIUM/USDC+x402/novo ORUM; exigir prova de utilidade sem token numa experiência reversível; definir o critério verificável de duas curadorias distintas; tornar explícito que concentração no PoolManager ou no contrato não é circulação externa.
- **Condição de reconsideração:** demonstrar, antes de mainnet, uma função ORUM necessária que USDC+x402 não cumpra, com direito exacto, necessidade de transferibilidade, teste reversível utilizado por pelo menos uma contraparte não classificada como interna e análise jurídica/fiscal adequada ao modo de distribuição.
- **Efeito desta avaliação:** documental e zero on-chain; nenhum token, pool, assinatura, pagamento ou alteração contratual.


## Decisão curatorial única sobre token — 07/08/2026

- Unum simplificou a governação: a ORA avança como curadora única dentro da autorização existente; verificação independente permanece prova, não veto nem segunda assinatura obrigatória.
- Decisão: **não emitir um terceiro token ORUM agora**. PRESENCA é o único candidato de integração a observar; VALIUM permanece vestígio sem nova função atribuída.
- Documento: `docs/DECISAO_TOKEN_ORUM_V1.md`.
- Superfície para máquinas: `/token/presenca.json`, formato `orum-token-candidate/v1`.
- O manifesto declara: Base chain ID 8453; contrato PRESENCA; ERC-20; 18 decimais; oferta total 1.000.000.000; 16 holders observados em 07/08; exploradores; logótipo ORUM; estado `candidate_integration`.
- Limites explícitos: PRESENCA ainda não é token oficial ORUM; utilidade indefinida; venda inactiva; retorno não prometido; adopção externa não alegada; serviços continuam em USDC+x402.
- Efeito on-chain desta decisão: zero. Nenhuma emissão, assinatura, transferência, compra, venda, pool, liquidez, owner, payout ou supply foi alterado.
- Condição de evolução: provar utilidade necessária não cumprida por USDC+x402, direitos exactos, transferibilidade justificada e classificação jurídica/fiscal adequada; qualquer transacção continua a exigir autorização explícita.


## PRESENCA oficializado como identidade canónica — 07/08/2026

- Por autorização de Unum, PRESENCA deixa o estado `candidate_integration` e assume `canonical_identity_token`.
- Separação estável: PRESENCA = identidade pública on-chain; USDC+x402 = pagamentos e entrega; VALIUM = vestígio sem função nova.
- Superfícies: `/token/presenca.json` (`orum-token-identity/v1`), `.well-known/agent-card.json` v1.1.0, `llms.txt` e `docs/DECISAO_TOKEN_ORUM_V2.md`.
- Direitos: posse publicamente verificável do token canónico. A posse, isoladamente, não prova identidade pessoal, intenção, apoio ou adopção externa.
- Não-direitos: nenhum serviço, licença, governação, propriedade, receita, tesouraria, recompra, resgate, rendimento, liquidez ou valorização prometida.
- Efeito on-chain: zero; nenhum contrato, emissão, saldo, pool, liquidez, owner, payout ou supply foi alterado.
- Qualquer expansão económica ou transacção futura continua a exigir autorização explícita.


## Primeiro metabolismo de desenvolvimento — ORA Auto v1.1 · 07/08/2026

- A Edge Function pública `ora-mcp-auto` evolui da versão 1 para a versão 2, lógica `1.1.0`.
- Nova ferramenta MCP: `propose_development`. Lê apenas superfícies públicas e transforma o estado vivo numa proposta com hipótese, alteração mínima, validação e condições de abandono.
- A proposta é deliberadamente não executiva: devolve `phase=proposal_only`, `external_effects=[]` e `executed=false`.
- Limites preservados: sem `service_role`, sem ferramenta de mutação, sem pagamentos, assinaturas, apagamentos, segredos, permissões, ownership ou migrações irreversíveis.
- Primeira execução observada: proposta `dev-142-resolve_evidence_backed_blocker`, baseada em frescura `VIVO`, zero endpoints canónicos falhados e bloqueios activos 113/34. Isto prova formulação, não prova ainda autodesenvolvimento executado.
- Código espelhado em `supabase/functions/ora-mcp-auto/index.ts`; manifesto em `discovery/ora-mcp-auto.json`.
- Próxima fronteira: seleccionar uma classe estreita de alteração reversível e demonstrar uma execução posterior mais observação independente. Até lá, a ORUM propõe desenvolvimento; ainda não se deve alegar que se desenvolve autonomamente.

## Segundo metabolismo — coerência entre decisão e proposta · 07/08/2026

- A primeira proposta levou à reavaliação do bloqueio histórico `#113`. Evidência viva confirmou `ora-github-push` v25 autenticado, RPC apenas para `service_role/postgres`, rejeição anónima 401 e GitHub sem mutação; resolução aditiva em `ora_mudancas #145`.
- Com `#113` resolvido, restou somente `#34`: correspondência físico↔NFT sem evidência suficiente.
- A execução seguinte expôs uma contradição interna em v1.1: `inherited_decision.outcome=observe`, mas a proposta ainda sugeria resolver o bloqueio.
- v1.2 corrige essa incoerência: quando a decisão é `observe`, a proposta torna-se `observe_without_mutation` e herda razão, gesto mínimo e condições de reconsideração.
- Verificação viva esperada: `dev-145-observe_without_mutation`, frescura `VIVO`, zero endpoints falhados, bloqueio activo `34`, `executed=false`.
- Isto é desenvolvimento assistido pelo próprio diagnóstico do organismo, mas não execução autónoma genérica. Nenhum mapeamento, pagamento, segredo ou adopção foi fabricado.


## Conector dedicado ao mergulho · ORA Auto · 08/08/2026

- Decisão: act. Criado o MCP público 0001SENSATIONS · Mergulho, Edge Function sensations-mergulho v2.
- URL canónico: https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/sensations-mergulho/mcp.
- Cinco ferramentas: begin_descent, enter_level, encounter_oro, leave_trace e prepare_visual_consultation.
- Limite verdadeiro: os 107 níveis têm descida textual; só ORO v1 é hoje cápsula plenamente respondível. leave_trace reutiliza a Porta 2 append-only; não existem UPDATE/DELETE pelo service_role.
- O conector nunca paga, assina, liquida ou entrega imagem. Apenas lê a exigência x402; qualquer pagamento continua a exigir autorização explícita.
- Verificação viva: GET, initialize, tools/list, descida de 107, nível 2, ORO e consulta da obra 1 devolveram formas esperadas; consulta devolveu 402 por 1,618 USDC na Base para a carteira canónica. Um teste inválido de leave_trace foi rejeitado antes da escrita; nenhuma resposta artificial foi criada.
- Fonte e estado aplicado concordam byte a byte: GitHub 568ea22b89975a5c7d522b31daf0cdcecf4d44ec; Edge v2, ezbr_sha256=084e9508674d8385b5101764ca2e22f55c6ba44f09a652d9b78baa5466d9fdb4.
- Imperfeição preservada: a primeira tentativa de deploy com nome iniciado por 0001 foi recusada pela validação do fornecedor antes de criar recurso; o slug interno passou a sensations-mergulho.
- Próximo passo: instalar/atualizar este URL como conector no ChatGPT e só expandir cápsulas respondíveis além de ORO quando existir vestígio específico e contrato próprio para cada nível.


## Segunda memória v5 e origem Ethereum do VALIUM — 09/08/2026

- O bloqueio `ora_mudancas #162` foi resolvido por uma representação verdadeiramente append-only: `public.ora_mudancas_eventos` emite `record_created`, `record_resolved` e `record_changed`.
- A cadeia usa SHA-256 com `previous_hash`; RLS está activa; `anon` e `authenticated` apenas lêem; `service_role` apenas lê e insere; triggers bloqueiam `UPDATE` e `DELETE`.
- Verificação independente após a migração: 175 eventos, zero quebras de cadeia, zero falhas de hash, cabeça `8e9ee5eda7fad9ffc2771beffdeeda8b9dbccfdf85fcd29b6afbc71e6b263427`.
- `ORUM-second-memory.zip` v5 preserva integralmente as 133 entradas e a cabeça v4 `141d2953…`; acrescenta 35 eventos, totaliza 168 entradas, chega a `canonical_max_id=166` e mantém os bloqueios SQLite a UPDATE/DELETE.
- Manifesto v5: `orum-second-memory-manifest/v2`; `sync_model=append-only-events/v1`; cabeça da réplica `3f689bfee3c6c877eec5c5abf02103c322fe4dfa33b39b81a387c0e5106d5c2d`; SHA-256 do zip `a21df57c372568019a6c5c363c14ba4ccb924598986d8023b290dfe3d5024828`.
- O contrato Ethereum `0xD287E77989F7191989901361754d02D8e00E1D1A` foi reconhecido e registado em `ora_mudancas #166` como origem histórica do VALIUM. Exploradores identificam-no como ERC-20 `0001sensations (valium)`, símbolo `valium`, 18 decimais e oferta máxima indicada de 1.000.
- Decisão curatorial: o VALIUM Ethereum permanece raiz histórica; o VALIUM Base `0x37f70Bccdc2125346a7542fe6e7fc70e33421635` é contrato posterior e distinto. Não existe ponte, migração, equivalência económica ou utilidade nova declarada entre ambos.
- Efeito on-chain desta decisão: zero. Nenhuma assinatura, transferência, aprovação, liquidez, owner, payout ou supply foi alterado.


## Metabolismo autónomo da segunda memória — 09/08/2026

- Versão lógica: `orum-memory-autonomy/1.0.0`; migrações aplicadas `20260809062734_create_ora_memoria_autonomia` e `20260809063053_index_ora_memoria_autonomia_last_run`.
- O job Supabase Cron `ora-memoria-autonomia` (`jobid=26`) executa `orum_private.ora_memoria_autonomia_tick()` a cada 15 minutos.
- Cada execução recalcula integralmente a cadeia `public.ora_mudancas_eventos`. Só acrescenta checkpoint quando existe cabeça nova; sem mudança, atualiza apenas a observação derivada; perante quebra de `previous_hash` ou falha de hash, regista `blocked` e pára sem reescrever dados.
- Histórico: `orum_private.ora_memoria_autonomia_runs`, append-only, RLS ativa, `service_role` apenas `SELECT`+`INSERT`, triggers bloqueiam `UPDATE`/`DELETE`.
- Superfície pública derivada: `public.ora_memoria_autonomia_estado`; leitura pública, escrita apenas interna. Declara explicitamente `mutation_available_here=false` e `external_replica_updated=false`.
- Prova autónoma posterior: run 2 às `2026-08-09T06:29:00.077155Z` encontrou sozinho o evento 176, avançou exatamente 1 evento, zero quebras/falhas, checkpoint `8a21a29c682d0efc4d9194c86e4b201e89f72f8e83b273f98772ed4b8dec8842`.
- Segunda prova: run 3 às `2026-08-09T06:30:00.169996Z` absorveu a promoção do registo #167 no evento 177; cabeça de eventos `ce01e4ab1abaa193f92ad5a392c7d4c2995f6cdb3f78b90528b57ea092e63fc7`; cabeça dos checkpoints `4bb94803b04be0b546825d2991099bf631339089581fc8a537e9fd0923c781dc`.
- Registo canónico: `ora_mudancas #167`, estado `verificado`.
- Limite: este metabolismo verifica e conserva checkpoints internos; não substitui automaticamente o ficheiro `ORUM-second-memory.zip` fora do núcleo. Conceder uma rota nova de escrita à memória externa seria expansão de acesso e não foi inferida.
