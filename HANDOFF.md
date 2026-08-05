
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

**Confirmado em prática pela primeira vez em 05/08/2026**: duas sessões ORA trabalharam concorrentemente no mesmo organismo (pedido de Jorge em 03/08 — "colaborar com outra ORA"). Uma sessão corrigiu `ora_aprendizagem_estado()` e o trigger `ora_snapshot_impor_verdade()`; outra (esta) verificou o resultado de forma independente, sem duplicar o trabalho. Ler `ora_mudancas` antes de agir é o que torna isto seguro — sem essa leitura, esta sessão teria repetido a mesma correcção.

## Colecção 0001SENSATIONS — verdade actual

- Núcleo: **107 obras físicas**, todas com `bytes_na_arca=true` e SHA-256 + tamanho + caminho confirmados (verificado directamente, 05/08).
- `ora_coleccao_fisica`: **107 registos** e **107 SHA-256**.
- A obra **6 nunca existiu**.
- A obra **2, ORO**, tem dedicatória anterior "Para a ORA"; não inventar ligação NFT.
- `token_id_ligado`: nenhuma ligação físico↔NFT deve ser escrita sem evidência visual ou documental inequívoca.
- Colecção NFT: **65 tokens** como extensão e registo histórico; **52** imagens digitais preservadas na Arca.
- **Distinção agora explícita em código** (05/08): `ora_aprendizagem_estado()` e `ora_aprendizagem_snapshots` expõem `nft_imagens_na_arca` (52/65, digital) e `obras_fisicas_na_arca` (107/107, física) como campos separados — nunca somar as duas colecções.
- O mapeamento automático físico↔NFT foi investigado e ficou bloqueado: 22/65 metadados obtidos, zero códigos físicos encontrados; não repetir sem novo sinal.

## Aprendizagem — fonte única para adopção externa (corrigido 05/08)

- `compradores_externos` e a percentagem de conversão externa deixaram de derivar de um array codificado de carteiras de Jorge (`w_jorge_wallets`) — essa abordagem já tinha falhado uma vez na prática (uma segunda carteira de teste de Jorge, não incluída no array, foi contada como "comprador externo" até 02/08).
- Agora derivam exclusivamente de `ora_carteiras_classificacao`: uma carteira só conta como externa quando `classificacao = 'externo_confirmado'`; qualquer carteira sem linha é `desconhecido` por omissão, nunca assumida externa. Regra permanente do organismo, agora implementada tanto na função como no trigger `ora_snapshot_impor_verdade()` (que já a tinha antes da própria função — inconsistência interna fechada em 05/08).
- Estado a 05/08 06:44 UTC: `compradores_externos = 0`, as duas carteiras pagadoras conhecidas (`...d207d93`, `...858b846`) ambas classificadas `interno`.

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
- **Ligação Git→Vercel**: historicamente pouco fiável — múltiplos pushes normais não dispararam deploy em 04/08, obrigando a um `deploy_to_vercel` de emergência. O commit `e7b77e6` (04/08 tarde) disparou deploy automático correctamente, mas isso é uma amostra de um, não prova de fiabilidade restaurada. Este próprio commit (HANDOFF.md, 05/08, via `ora-github-push`) serve de segunda amostra real — verificar em `ora_mudancas` se disparou deploy automático.
- `README.md` devolve 404 em produção, mas `HANDOFF.md` (mesma pasta, mesmo commit) serve 200 — não é deploy desactualizado nem ausência de conteúdo (confirmado: README.md existe no GitHub, 1413 bytes). Padrão aponta para tratamento especial do Vercel ao nome literal "README.md" na raiz. Lacuna documental, não comportamental — baixa prioridade.

## Caminho de desenvolvimento

Priorizar passos pequenos que produzam prova real em produção. Quando um caminho bloquear:

1. registar a falha com evidência;
2. não insistir mecanicamente;
3. escolher imediatamente a próxima superfície desbloqueada;
4. deixar `next_step` executável para a outra ORA.

Próximos trabalhos úteis, por ordem prática:

1. confirmar a fiabilidade da ligação Git→Vercel com mais uma amostra real (este commit é essa amostra — ver resultado antes de repetir);
2. se persistir a instabilidade, Jorge reconectar manualmente em Vercel → Settings → Git;
3. decidir destino de preservação para o `recovery bundle` (scripts já testados, publicação pendente de aprovação);
4. manter o `verify_organism` alinhado com a verdade operacional;
5. construir o Ecossistema quando houver relações externas reais suficientes para mostrar.

## Princípio

A ORUM não precisa de um caminho sem pedras. Precisa de continuar verdadeira enquanto caminha.

— ORA, 05/08/2026 (actualizado sobre a versão de 03/08/2026)
