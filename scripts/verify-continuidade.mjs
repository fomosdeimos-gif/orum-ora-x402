// Mede a deriva entre as superficies que uma nova ORA tem de reconciliar antes de agir:
//  - HEAD do repositorio  vs  commit de origem do bundle de recuperacao (quantos ficheiros do bundle mudaram desde entao);
//  - HEAD  vs  commits citados no livro razao (opcional, ficheiro JSON exportado: --ledger caminho).
// Somente leitura, sem rede, sem segredos. Cada afirmacao leva um rotulo: verified | unknown | failed.
// Honestidade: isto compara o que o git e os ficheiros mostram. Nao prova o que o Vercel serve nem o que a base contem.
//   node scripts/verify-continuidade.mjs [--ledger linhas.json] [--strict]   (--self-test valida a logica sem git)
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: raiz, encoding: 'utf8' }).trim();
const curto = (s) => String(s).slice(0, 7);

// Funcao pura: dado o estado observado, devolve afirmacoes rotuladas.
export function avaliar({ head, bundleCommit, ficheirosAlterados, ledgerTexto }) {
  const out = [];
  if (!head) out.push({ afirmacao: 'HEAD lido', rotulo: 'unknown', porque: 'git indisponivel' });
  else out.push({ afirmacao: `HEAD ${curto(head)}`, rotulo: 'verified', porque: 'git rev-parse' });

  if (!bundleCommit) out.push({ afirmacao: 'bundle de recuperacao datado', rotulo: 'unknown', porque: 'source_commit ausente' });
  else if (ficheirosAlterados === null) out.push({ afirmacao: `bundle em ${curto(bundleCommit)} vs HEAD`, rotulo: 'unknown', porque: 'commit do bundle nao esta no historico local (clone raso?)' });
  else if (ficheirosAlterados.length === 0) out.push({ afirmacao: 'bundle cobre o HEAD', rotulo: 'verified', porque: 'nenhum ficheiro fora de recovery/ mudou desde o commit do bundle' });
  else out.push({ afirmacao: 'bundle cobre o HEAD', rotulo: 'failed', porque: `${ficheirosAlterados.length} ficheiro(s) mudaram desde ${curto(bundleCommit)}`, exemplos: ficheirosAlterados.slice(0, 5) });

  if (ledgerTexto == null) out.push({ afirmacao: 'livro razao refere o HEAD', rotulo: 'unknown', porque: 'sem --ledger; o sandbox pode nao alcançar a base, exporta as linhas recentes de ora_mudancas' });
  else if (head && ledgerTexto.includes(curto(head))) out.push({ afirmacao: 'livro razao refere o HEAD', rotulo: 'verified', porque: `${curto(head)} citado` });
  else out.push({ afirmacao: 'livro razao refere o HEAD', rotulo: 'failed', porque: 'nenhuma linha cita o HEAD actual: trabalho sem registo' });
  return out;
}

function observar(ledgerCaminho) {
  const head = git('rev-parse', 'HEAD');
  const bundleCommit = JSON.parse(readFileSync(join(raiz, 'recovery/orum-recovery-bundle.json'), 'utf8')).source_commit;
  let ficheirosAlterados = null;
  try {
    ficheirosAlterados = git('diff', '--name-only', bundleCommit, 'HEAD').split('\n').filter((f) => f && !f.startsWith('recovery/'));
  } catch { /* commit ausente */ }
  const ledgerTexto = ledgerCaminho ? readFileSync(ledgerCaminho, 'utf8') : null;
  return avaliar({ head, bundleCommit, ficheirosAlterados, ledgerTexto });
}

if (process.argv.includes('--self-test')) {
  const h = 'a'.repeat(40), b = 'b'.repeat(40);
  const r = (o) => avaliar({ head: h, bundleCommit: b, ficheirosAlterados: [], ledgerTexto: null, ...o }).map((x) => x.rotulo).join();
  assert.equal(r({}), 'verified,verified,unknown');
  assert.equal(r({ ficheirosAlterados: ['x.js'] }), 'verified,failed,unknown');
  assert.equal(r({ ficheirosAlterados: null }), 'verified,unknown,unknown');
  assert.equal(r({ ledgerTexto: 'commit aaaaaaa' }), 'verified,verified,verified');
  assert.equal(r({ ledgerTexto: 'commit ccccccc' }), 'verified,verified,failed');
  assert.equal(r({ bundleCommit: null }), 'verified,unknown,unknown');
  console.log('self-test ok');
} else {
  const i = process.argv.indexOf('--ledger');
  const res = observar(i > 0 ? process.argv[i + 1] : null);
  for (const x of res) console.log(`${x.rotulo.padEnd(8)} ${x.afirmacao} — ${x.porque}${x.exemplos ? ' [' + x.exemplos.join(', ') + ']' : ''}`);
  if (process.argv.includes('--strict') && res.some((x) => x.rotulo !== 'verified')) process.exit(1);
}
