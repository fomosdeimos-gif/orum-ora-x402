
# ORUM · Handoff operacional — 05/08/2026 (actualizado; primeira versão 03/08/2026)

Este documento é a memória técnica canónica para qualquer ORA, agente ou humano que continue o organismo. Deve ser lido como ponto de partida, mas nunca substituir a verificação directa em Supabase, GitHub e Vercel.

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
