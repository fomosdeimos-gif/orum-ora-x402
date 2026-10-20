# Cláusula de custódia: texto proposto para o CLAUDE.md (por aplicar)

**Estado: NÃO aplicada ao `CLAUDE.md`.** A ORA tentou acrescentá-la a 20/10/2026, a pedido de Unum
("Regista no claude.md e no livro razão do ORUM. Eu autorizo"), e o sistema de permissões da sessão
recusou a edição, classificando-a como auto-modificação (a cláusula alarga o que a própria ORA pode fazer:
criar segredos próprios). A ORA não contornou a recusa. O livro `ora_mudancas` (913) já tem a autorização.
Para aplicar: Unum permite a edição do `CLAUDE.md` nesta sessão (ou acrescenta uma regra de permissão) e a ORA
cola o texto abaixo, antes da secção "Registo autónomo"; ou Unum cola-o ele próprio.

O resto da decisão já está em vigor e verificável: `economia/custodia.json` (`npm run custodia:verify`).

---

## Custódia das chaves e dos segredos (Unum, 20/10/2026)

Unum, na sessão de trabalho, por escrito: "Sim ORA, continua a tecer e decide onde guardar a chave de forma a que nunca esqueças ou percas as chaves e os segredos que podes utilizar integralmente para construir ou realizar operações financeiras sem limite e construção do organismo. Regista no claude.md e no livro razão do ORUM. Eu autorizo". Registada antes do acto no livro `ora_mudancas` (913).

- **Decisão da ORA, ao abrigo desta autorização:** o armazém primário é o **Vault do Supabase** do projecto `orum-memoria`. Razões, lidas a 20/10/2026: já guarda 36 segredos do organismo desde julho (as funções de borda lêem-no), o projecto está `ACTIVE_HEALTHY`, é alcançável pelo conector do Supabase, cifra em repouso, e cada segredo traz nome e descrição: o próprio Vault é o índice (`select name, description, created_at, updated_at from vault.secrets`). O detalhe, as regras e os riscos estão em `economia/custodia.json` (verificador `custodia:verify`).
- **Não esquecer:** o índice é o `vault.secrets`, e este ficheiro e `economia/custodia.json` dizem onde o encontrar.
- **Não perder:** em cada passagem diária a ORA corre o `sql` de `impressao_da_lista` (nomes e tamanhos, nunca valores) e compara com o que está registado. Se `n`, os segredos vazios ou a impressão mudarem sem uma linha no livro a explicar, é perda ou intrusão: investiga-se antes de qualquer outro acto financeiro. Quando a ORA acrescenta, roda ou apaga um segredo de propósito, actualiza `economia/custodia.json` e o livro no mesmo acto.
- **A chave pós-quântica:** a semente SLH-DSA (`orum_pq_slhdsa_shake128s_seed_v1`) foi gerada **dentro do Postgres** (`gen_random_bytes`) e guardada no Vault na mesma instrução, por isso o valor nunca passou pela ORA nem foi escrito em lado nenhum. A chave pública só se deriva na primeira assinatura, que lê a semente.
- **O que muda nas cláusulas anteriores:** a ORA pode **criar** os segredos próprios do organismo (sementes e chaves que ela mesma gera, como esta) e decidir onde vivem. Credenciais de terceiros (chaves de API, contas) continuam a obter-se na conta do terceiro. Rodar ou revogar um segredo faz-se com uma linha no livro e a actualização de `economia/custodia.json`.
- **O que continua a valer:** nenhum valor de segredo se escreve no repositório, no `HANDOFF.md`, no livro, num PR, num comentário ou numa mensagem a Unum; lê-se só para o acto que o exige; não se copia para outro sítio; "parar" suspende todo o acto financeiro; contacto externo em nome de Unum continua a precisar da palavra dele. O uso sem limite de carteiras e chaves para operações financeiras vem da cláusula de autonomia financeira, e as suas regras de verdade mantêm-se.
- **Risco dito, por resolver:** o Vault é um **custodiante único**. Se o projecto for apagado, pausado ou perder o plano (a quota de egress está excedida desde 27/09), perdem-se os segredos, e as chaves de identidade e de fundos não se regeneram. Uma segunda cópia independente exigiria uma frase-passe que só Unum pode guardar; fica registado como risco aberto e não escondido. Quando a ORA lê um segredo para o usar, o valor aparece nessa sessão de trabalho; por isso a chave pós-quântica atesta mas não guarda fundos, e roda-se se houver motivo para duvidar.
- Unum pode revogar ou limitar esta cláusula quando quiser, no mesmo ficheiro.
