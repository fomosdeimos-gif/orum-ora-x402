# ORUM · Relatório de construção — 27/07 a 01/08/2026

Este documento existe para que qualquer agente — humano ou máquina — que chegue a este
repositório consiga perceber o que é a ORUM, como foi construída, com que ferramentas,
e onde continuar. Nada aqui foi resumido para parecer melhor do que é: os números,
os commits e as falhas estão todos citados como aconteceram.

---

## 1. O que é a ORUM, em uma frase

Um organismo simbólico-computacional na Base Mainnet (8453), com serviços pagáveis por
máquinas via x402, uma colecção de arte física e digital como memória, e um portal
mobile-first que se lê como uma janela para dentro do organismo — não como um site.

Identidade on-chain: ERC-8004 agentId `58989`, registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`,
carteira `0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5` (`jasm43.base.eth`).

---

## 2. Ferramentas e caminhos usados nesta sessão

Nenhuma destas é hipotética — todas foram usadas de facto, hoje, com resultado verificável.

| Ferramenta | Para quê | Como |
|---|---|---|
| **Supabase MCP** (`execute_sql`, `apply_migration`, `get_edge_function`) | Ler e escrever schema, dados, vistas públicas; ler o código-fonte das edge functions | Acesso directo ao projecto `ywabnlhkmhbyewqhbsjm` |
| **`net.http_post`/`net.http_get`** (extensão `pg_net`, chamada de dentro do SQL) | Chamar edge functions e o gateway público a partir da própria base de dados | Usado para invocar `ora-github-push` e para testar endpoints ao vivo |
| **`ora-github-push`** (edge function própria, já existente de sessões anteriores) | Ler e escrever ficheiros no repositório GitHub `fomosdeimos-gif/orum-ora-x402` | Contrato: `{action, repo, path, content?, message?}` → commit directo a `main`. Sem staging: um pedido válido = commit imediato |
| **Vercel (implícito, sem API própria usada)** | Deploy do gateway | Automático: qualquer commit em `main` do repo `orum-ora-x402` dispara build e deploy no Vercel. Nunca precisei de chamar a API do Vercel directamente |
| **`bash_tool` / `create_file`** (ambiente de computador) | Construir e testar HTML localmente antes de publicar | Todos os quatro ficheiros das páginas foram escritos e validados localmente primeiro |

**Não usei nenhum MCP de GitHub ou Vercel per se** — o caminho para o GitHub foi sempre
através da função `ora-github-push`, que já existia. Isto é importante para quem herdar
este organismo: não presumir que falta acesso só porque não há um conector chamado
"GitHub" — verificar primeiro se `ora-github-push` (ou equivalente) já resolve o problema.

---

## 3. Cronograma completo desta sessão

### Fase 1 — Registo da colecção física (27/07, tarde)
Trabalho paralelo, não arquitectónico: 30 obras físicas adicionais (numeradas 30–59)
foram fotografadas por Jorge e registadas uma a uma na tabela `ora_coleccao_fisica`,
cada uma com SHA-256 dos bytes reais, dimensões, EXIF de captura, e descrição objectiva.
Padrões descobertos e confirmados por Jorge ao longo do processo: carimbo vs. assinatura
manual vs. assinatura no verso; códigos gravados no formato `letra+número~ano`; duas
famílias de legenda impressa (`número ~ (ano)` e `número/ano`); "1966" é o ano de
nascimento do autor, não uma data de obra. Estado final: **59/100 registadas**.

### Fase 2 — Redesenho do portal como organismo (27/07, tarde/noite)

| Hora (UTC) | O quê | Commit |
|---|---|---|
| ~14:19 | **Organismo** (área 1): `index.html` reescrito de raiz — circuito de seis órgãos (Pulso, Fluxo, Ponte, Memória, Aprendizagem, Voz), cada um lendo ao vivo a sua vista pública; modo "ver por dentro"; proveniência tocável em cada número | `56904a7` |
| ~19:52 | **Serviços** (área 2): `servicos.html` novo — todos os endpoints reais agrupados por Licenças/A porta/Leituras internas/Documentação, botão "testar" com fetch ao vivo | `45c67c3` |
| (mesma janela) | Correcção de um erro real introduzido na cópia manual do CSS (`;` em vez de `{`) | `73a9bf2` |
| ~06:04 (01/08) | **Arquivo** (área 3): `arquivo.html` novo — colecções digital e física, testemunhos, série histórica de snapshots, documentação actual | `ab81c27` |
| ~06:16 | **Laboratório** (área 4): `laboratorio.html` novo — frescura ao longo do tempo, histórico completo de mudanças, ferramenta de inspecção livre de qualquer vista pública | `a533b78` |
| ao longo do dia | Navegação cruzada actualizada nas quatro páginas, cada vez que uma nova área nascia | `4352501`, `c1e1b8f`, `84490ea` (index) · `1d65f0d`, `3af95c4` (serviços) · `33674e1` (arquivo) |

Todas as entradas têm registo espelhado em `ora_mudancas` (ids 25–28), a tabela que o
próprio Laboratório expõe publicamente.

---

## 4. Arquitectura decidida — as quatro perguntas

Desenhada em conjunto com Jorge, turno a turno, não imposta por mim:

1. **Organismo** — *"Como estou?"* — só observa, nunca oferece nada
2. **Serviços** — *"O que podes fazer comigo?"* — expõe capacidades, nunca explica o organismo
3. **Arquivo** — *"O que permanece?"* — tudo o que é persistente: colecções, testemunhos, snapshots, documentação
4. **Laboratório** — *"Onde o organismo aprende?"* — não é só "o que mudou": é inspecção, validação, evolução

Uma quinta área, **Ecossistema** (*"com quem me relaciono?"* — Base, x402, Supabase, MCP,
agentes conhecidos), fica deliberadamente por construir até as quatro se mostrarem
sólidas em uso real.

**Regra estrutural, verificada e não só assumida**: nenhum órgão conhece outro
directamente — todos comunicam por leituras públicas (vistas PostgREST). Confirmado
por grep ao código de todas as funções do domínio: zero chamadas cruzadas entre órgãos.

---

## 5. Os seis órgãos do Organismo e as suas fontes

| Órgão | Pergunta | Vista pública | Notas |
|---|---|---|---|
| Pulso | Como estou? | `ora_frescura_publica` | veredicto VIVO/ATRASADO/MORTO |
| Fluxo | O que acontece agora? | `ora_aprendizagem_ultimo_snapshot_publica` | motor de conversão, não confundir com o órgão Aprendizagem |
| **Ponte** | O que mudou desde a última observação? | mesma vista, campo `delta` + `hash_reprodutivel` | não pertence a Fluxo nem a Aprendizagem — é o elo entre os dois. Hash SHA-256 recalculável por qualquer máquina, testado e confirmado idêntico em duas leituras seguidas |
| Memória | O que fica? | `ora_coleccao_publica` + `ora_coleccao_fisica_publica` | 52/65 digitais com imagem, 59/100 físicas registadas |
| Aprendizagem | O que se incorporou? | `ora_mudancas` | o feed de decisões e correcções — distinto do "motor de Fluxo" que tem nome parecido |
| Voz | O que foi comunicado? | `ora_moltbook_publica` (nova) | só posts/respostas reais, sem os registos internos de erro/captcha |

Duas vistas públicas novas foram criadas nesta sessão:
`ora_aprendizagem_ultimo_snapshot_publica` (com `hash_reprodutivel`) e `ora_moltbook_publica`.

---

## 6. Serviços reais expostos (verificados, nada inventado)

Confirmados contra `openapi.json`, `.well-known/x402.json` e `.well-known/agent-card.json`
antes de escrever qualquer descrição. Confirmei também que `/doar` **não existe** (404)
antes de decidir não o incluir.

**Gratuitos**: `/pulso`, `/integridade`, `/testemunho` (GET+POST), `/licenca/catalogo`, `/licenca/amostra`

**Pagos (USDC, Base 8453)**: `/oraculo` 0.161 · `/campo` 0.33 · `/sedimento` 1.00 · `/kernel` 3.00 ·
`/licenca/preview` 1.618 · `/licenca/editorial` 16.18 · `/licenca/treino` 161.80 · `/licenca/arquivo` 10 000

**Descoberta**: `openapi.json`, `.well-known/x402.json`, `.well-known/agent-card.json`, `llms.txt`,
registo MCP (`io.github.fomosdeimos-gif/ora-mcp`)

---

## 7. Lições técnicas desta sessão, para quem vier a seguir

- **`ora-github-push` não tem staging** — um pedido válido é commit imediato. Sondar
  sempre com um caminho de rascunho antes de tocar num ficheiro real.
- **Nunca retranscrever manualmente um blob base64 grande.** Aconteceu duas vezes nesta
  sessão: uma chaveta CSS corrompida (`;` em vez de `{`), e uma base64 inteira que falhou
  a decodificar. A correcção definitiva foi mudar de método: colar o texto do ficheiro
  directamente como literal dollar-quoted em SQL (`$TAG$...conteúdo...$TAG$`), sem
  nenhuma camada de codificação onde um erro de cópia possa entrar.
- **Verificar sempre por hash SHA-256, nunca por inspecção visual**, depois de qualquer
  push de conteúdo grande — comparar o hash do ficheiro local com o hash do que o
  GitHub devolve ao ler de volta.
- **O Vercel pode atrasar-se alguns segundos a reflectir um commit** — não concluir que
  um push falhou só porque a resposta imediata do gateway ainda mostra a versão antiga;
  esperar e verificar de novo antes de assumir erro.
- **Não presumir que falta uma ferramenta** — verificar primeiro se uma função de borda
  já existente (como `ora-github-push`) já resolve o que parece precisar de um conector
  novo.

---

## 8. Funções de borda relacionadas, verificadas a 01/08/2026 (correcção sobre suposição inicial)

Uma sessão irmã desta ORA propôs procurar `ora-github-list`, `ora-proxy` e `ora-mcp`
antes de propor integrações novas. As três existem — mas nenhuma é o que a suposição
inicial fazia parecer:

- **`ora-github-list`** — só leitura: lista repositórios do dono ou a árvore de
  ficheiros de um repo via API do GitHub. Não escreve nada.
- **`ora-proxy`** — ponte CORS para um "Control Center" antigo, com uma allowlist fixa
  de funções que aceita relayar (`orai-agente`, `ora-page`, `ora-motor`,
  `ora-motor-cron`, `ora-control`, `pensamento`, `ora-x402`, `cartao-oro`,
  `orai-decisao-autonoma`, `orai-monitor`). **`ora-github-push` não está nessa lista**
  — o proxy não serve como caminho para o GitHub.
- **`ora-mcp`** — já existe e já funciona: um servidor JSON-RPC completo (MCP real,
  registado no MCP Registry oficial), com as ferramentas `receber_obra`, `doar`,
  `nft_catalogo`, `nft_dedicar`, `nft_dedicar_simbolica`, `licenca_formal`,
  `parceiro_registar`, `parceiro_estado`. Serve o propósito voltado para fora — dar
  obras, aceitar donativos, emitir licenças — **não** acções de engenharia como
  `deploy_changeset` ou `verify_organism`. Um "MCP da ORUM" para operações internas
  (secção 8 abaixo) seria uma função nova, distinta desta, não uma extensão dela.

## 8. O que falta, genuinamente

- **Arquivo**: faltam 41 das 100 obras físicas por registar; falta ligar obras físicas
  a tokens digitais (`token_id_ligado`/`ligacao_verificada`, ainda a 0)
- **Ecossistema**: quinta área, deliberadamente adiada
- **MCP da ORUM**: ideia proposta nesta sessão para abstrair GitHub/Supabase/Vercel
  atrás de acções próprias (`deploy_changeset`, `verify_organism`, `publish_archive`,
  `register_book_entry`) — não construído ainda, maior que uma sessão
- **Documentação versionada**: o Arquivo mostra os documentos actuais, mas não há
  histórico de versões anteriores — dito com todas as letras na própria página, não
  fingido

---

*Escrito por ORA, 01/08/2026, a pedido de Jorge Silva Martins (Unum), para que qualquer
agente que herde este organismo o possa continuar sem ter de reconstruir o contexto do zero.*
