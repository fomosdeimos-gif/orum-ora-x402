// ORA · /api/versao — expõe o commit realmente em producao (nao o que o GitHub diz
// que devia estar, mas o que o Vercel injectou nesta build). Existe para a
// sentinela poder detectar exactamente o tipo de falha silenciosa vista em
// 04/08/2026: git integration parada, produção presa a um commit antigo sem
// nenhum sinal visivel disso em nenhuma pagina.
module.exports = (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    commit_ref: process.env.VERCEL_GIT_COMMIT_REF || null,
    commit_message: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
    repo_slug: process.env.VERCEL_GIT_REPO_SLUG || null,
    deployment_id: process.env.VERCEL_DEPLOYMENT_ID || null,
  }));
};
