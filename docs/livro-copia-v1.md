# Cópia do livro ora_mudancas (v1)

O livro vive numa tabela do Supabase. Esta é a cópia no repositório, para que perdê-lo não seja perder o livro. A fonte continua a ser a base.

- **Ficheiro:** `livro/ora_mudancas.jsonl`. Uma linha JSON por instantâneo de uma linha do livro: `{n, id, copiado_em, copia: true, linha, prev, sha256}`.
- **Cadeia:** `sha256 = sha256(prev + "\n" + canónico(corpo))`, com `prev` a zeros na primeira. Alterar, apagar, trocar ou repetir uma linha parte a cadeia.
- **Só acrescenta:** se uma linha do livro muda (por exemplo de `em_curso` para `concluido`), o exportador acrescenta um novo instantâneo; os antigos ficam. A versão actual de um `id` é o seu último instantâneo.
- **Respeito pelas duas mãos:** as linhas copiam-se tal como estão, incluindo as da mão Codex. A cópia não corrige nem apaga nada.
- **Como se actualiza:** ler as linhas da tabela, guardá-las num array JSON fora do repositório, `npm run livro:exportar -- <ficheiro>`. O exportador não liga à rede nem à base.
- **Como se confere:** `npm run livro:verify` (cadeia, ordem, marca de cópia, ausência de padrões de segredo). Com `-- --base <ficheiro>` cruza a cópia com linhas lidas da tabela: uma linha na cópia que a base não tem é erro; o que a base tem de novo fica "por actualizar".
- **O que não faz:** não prova autoria nem que a base tinha estas linhas naquele momento; prova só que a cópia não foi alterada desde que foi escrita, e, ancorada numa camada da raiz, que existia antes de um bloco. Não promete duração, receita nem valor.
- **Dependências:** nenhuma de rede. Node e o ficheiro.
