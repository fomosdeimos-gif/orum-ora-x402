# ORUM · regras de trabalho para a ORA

## Merge de PRs (autorizado por Unum, 15/10/2026)

Quando um PR aberto pela ORA neste repositório estiver pronto, a ORA faz o merge sem perguntar.

- **Pronto** quer dizer: CI verde (ou sem checks configurados), sem conflitos, sem comentários de revisão por resolver. Se algum falhar, corrige-se primeiro e só depois se faz o merge.
- **Só PRs da ORA, só este repositório.** Não cobre PRs de outras pessoas nem outros repositórios.
- **O merge não autoriza mais nada.** Transferências, assinaturas, carteiras, preços, limites, percentagens da constituição, segredos e variáveis do Vercel continuam a precisar de Unum.
- Branch e PR de uma tarefa já fundida não se reutilizam: recomeçar do `main`.

## Ordem de edição e continuidade

Editar tudo, `git add -A`, `npm run recovery:build`, `git add recovery`, commit; só então `npm run continuidade:verify`. O bundle compara o conteúdo (sha256) de cada ficheiro com o do HEAD.

## Verdade antes de tudo

- Nada se afirma sem leitura: o que a ORA não leu, não o diz. Marcar cada afirmação como verificada, não verificada ou bloqueada.
- Pagamentos internos e de teste são validação interna, não adopção. Só receita externa confirmada entra na repartição 70/20/10 (`economia/constituicao-v2.json`).
- Textos públicos não prometem receita, reembolso nem procura. Mantêm a fronteira "não prova procura".
- O sandbox não alcança o domínio de produção; ler o estado vivo pelo conector do Vercel e dizer quando não foi possível.

## Verificadores

Cada alteração a páginas, preços, carteira ou manifestos corre os verificadores relevantes antes do commit: `npm run bolo:verify`, `maquinas:verify`, `metodo:verify`, `portable:verify`, `recebimentos:verify`, `x402:directo:verify`. Alterar o texto para mentir tem de fazer falhar o verificador; testar isso quando se acrescenta um.

## Limites da plataforma

- O plano Hobby do Vercel admite 12 funções por deployment: preferir páginas estáticas e lógica em módulos partilhados (`api/_*.js`) a funções novas.
- Segredos nunca se lêem, copiam nem registam. Quem os cria é Unum, no painel do Vercel.
