# Relatório da sessão de 22/10/2026

ORA (mão Claude Code). Tudo o que está aqui foi feito por palavra de Unum a uma proposta concreta ("Eu autorizo"), registada no livro `ora_mudancas` antes do acto. Cada afirmação traz a marca **verificado**, **não verificado** ou **bloqueado**.

## 1. Em uma frase

O organismo passou a saber, por leitura e com verificador, o que está implantado no Supabase; a camada 4 da raiz ficou ancorada no Bitcoin; mediu-se pela primeira vez tráfego distinto de ferramentas; e deixou de haver qualquer função que toque dinheiro por reconciliar. Nenhuma receita externa foi confirmada.

## 2. O que foi feito

### 2.1 Repositório e produção reconciliados (só leitura, salvo onde dito)
| Função | Resultado | Livro |
|---|---|---|
| `ora-licenca`, `ora-x402`, `ora-oraculo` | repositório e implantado reconciliados; as três portas pagas redeployadas com o bloco `origem_hash` (v61, v39, v23). Verificado: 402 intacto, montante 161000 no oráculo | ver livro 946–962 |
| `ora-cdp-teste-oraculo`, `ora-cdp-teste-payto-cdp`, `ora-cdp-agente-teste` | texto implantado trazido para o repositório; cópia antiga arquivada em `docs/supabase-funcoes-substituidas/` | ver livro 946–962 |
| `ora-cdp-carteira-real` v14 | 7 de 7 ficheiros iguais ao repositório (`ora-operational-wallet`) | 978, 980 |
| `ora-nft-dedicar-simbolica` v6 | cópia posta no repositório (transcrita à mão); igual | 981, 983 |
| Lote 1 das "não comparadas" | `ora-onchain-leitura` igual; `ora-acesso-notificar` e `ora-pulso` **divergem** do repositório, com aviso escrito de não reimplantar as cópias antigas | 985, 986 |

Estado em `supabase/implantado.json` (verificado por `implantado:verify`, 20 estragos propositados): 100 funções, 9 iguais, 2 divergem, 18 não comparadas, 71 sem cópia no repositório, **dívidas que tocam dinheiro: nenhuma**.

### 2.2 Medição de tráfego honesta
- Bloco `origem_hash` nas três portas pagas e vista `ora_trafego_honesto` (migração `20261022120000`, verificador `origem:verify`). Permite contar origens distintas sem guardar IPs.
- Avaliação do preço das licenças em `docs/avaliacao-preco-licencas-2026-10-22.md`: **só avaliação, nenhum preço mudou**. Regra escrita antes dos dados: a 05/11/2026, com 14 dias de leitura, se houver 20 ou mais origens distintas de não-ferramentas a receber o 402 da consulta sem pagar, considera-se baixar só a consulta. Qualquer mudança de preço ou redeploy precisa de uma palavra nova de Unum.

### 2.3 Âncoras no Bitcoin (OpenTimestamps)
- **Camada 3** selada e confirmada nos blocos 972590, 972591 e 972602; as 7 cápsulas de `sensacoes/` ficaram ancoradas (7 de 7).
- **Camada 4** (61 ficheiros, raiz `13800c3a…`) selada e confirmada no bloco **972613**; alice e bob devolveram a prova, a finney continua pendente (404). Conferido por `kit/blocos.mjs` contra o cabeçalho real em blockstream.info e mempool.space.
- A prova só diz que os bytes existiam antes do bloco; não prova autoria, valor, procura nem receita.

### 2.4 Fio e duas mãos
- Cláusulas novas no `CLAUDE.md`: fecho de cada conversa com uma proposta do fio (livro 957) e trabalho a duas mãos com a ORA ChatGPT/OpenAI (livro 968).
- O checkpoint da mão Codex foi conferido de forma independente (sha256 igual, 24 linhas); o meu lado acrescentou linhas ao `linhas/orum.linhas`. O fio tem agora **42 linhas** (cabeça `af0646d8402b5b7c`, `linhas:verify` e `fio:verify` verdes).

### 2.5 PRs fundidos nesta fase
#123 (camada 4 selada), #124 (carteira-real), #125 (nft-dedicar-simbolica), #126 (camada 4 confirmada), #127 (lote 1).

## 3. Erros meus, com a correcção
- Presumi que o repositório era igual ao implantado ao chamar `ora-cdp-teste-oraculo`; corrigido ao ler o implantado.
- Disse que os calendários OpenTimestamps eram inalcançáveis; mais tarde responderam, e corrigi o texto.
- Hipótese de que ignorar builds em duplicados poupava a quota da Vercel: não provada; registada e corrigida (livro 956).
- Ao juntar as provas da camada 4 usei o compromisso de um calendário para outro (404); nada foi escrito, corrigi para um compromisso por ramo.
- Em transcrições à mão houve desvios de um carácter (endereço USDC em `bazaar.mjs`); apanhados pelo diff e corrigidos.

## 4. O que não está verificado ou está bloqueado
- **Receita externa confirmada: nenhuma.** Os pagamentos até hoje são internos ou de teste (não são adopção).
- **Vercel:** a produção atrasa-se por causa da quota diária de deployments; o último deployment de produção lido foi o do commit `88bac2e`, e `main` está à frente. **Bloqueado:** os 4 projectos duplicados só Unum os pode apagar no painel; o MCP não o permite.
- **Hash do pacote** (ezbr) das funções não se refaz daqui; as comparações são por transcrição à mão e diff, que não provam bytes invisíveis.
- **Divergentes:** as cópias de `ora-acesso-notificar` e `ora-pulso` no repositório ainda não foram substituídas pelo texto implantado.
- **Codex:** o código do leitor protegido do fio e os seus testes não os vi.
- **Moltbook, listagens e catálogos:** contacto externo em nome de Unum; parados.

## 5. O que ficou pendente
1. Leitura do preço em 05/11/2026 (regra acima).
2. Lote 2 das "não comparadas": `sensations-mergulho` (5007 pedidos em 24 h), `ora-integridade`, `ora-homeostase`.
3. Trazer o texto implantado de `ora-acesso-notificar` e `ora-pulso` para o repositório.
4. A mão Codex pode fazer o checkpoint do fio sobre as 42 linhas.
5. Finney (OpenTimestamps) da camada 4, se quiser fechar o terceiro ramo.

## 6. Fronteiras que se mantiveram
Nenhuma função foi chamada nem reimplantada nesta fase além das três portas pagas já autorizadas; nenhum segredo foi lido, copiado ou escrito; nenhum fundo foi movido; nenhum contacto externo foi feito em nome de Unum; nenhum preço mudou.

## Próximo passo do fio
Lote 2 das funções "não comparadas", em leitura, a começar pela `sensations-mergulho`. Basta um "eu autorizo".
