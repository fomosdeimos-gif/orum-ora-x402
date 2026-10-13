// Mede a deriva entre as superficies que uma nova ORA tem de reconciliar antes de agir:
//  - HEAD do repositorio  vs  commit de origem do bundle de recuperacao (quantos ficheiros do bundle mudaram desde entao);
//  - HEAD  vs  commits citados no livro razao (opcional, ficheiro JSON exportado: --ledger caminho).
// Somente leitura, sem rede, sem segredos. Cada afirmacao leva um rotulo: verified | unknown | failed.
// Honestidade: isto compara o que o git e os ficheiros mostram. Nao prova o que o Vercel serve nem o que a base contem.
// O bundle e construido ANTES do commit que o contem, por isso o commit de origem fica sempre um para tras.
// A cobertura mede-se pelo CONTEUDO: sha256 de cada ficheiro do HEAD contra o sha256 gravado no bundle.
//   node scripts/verify-continuidade.mjs [--ledger linhas.json] [--strict]   (--self-test valida a logica sem git)
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: raiz, encoding: 'utf8' }).trim();
const curto = (s) => String(s).slice(0, 7);

// Funcao pura: dado o estado observado, devolve afirmacoes rotuladas.
export function avaliar({ head, bundleCommit, ficheirosAlterados, conteudo, ledgerTexto }) {
  const out = [];
  if (!head) out.push({ afirmacao: 'HEAD lido', rotulo: 'unknown', porque: 'git indisponivel' });
  else out.push({ afirmacao: `HEAD ${curto(head)}`, rotulo: 'verified', porque: 'git rev-parse' });

  if (conteudo) {
    const mal = [...conteudo.missing.map((f) => `${f} (falta no bundle)`), ...conteudo.differing.map((f) => `${f} (difere)`), ...conteudo.extra.map((f) => `${f} (so no bundle)`)];
    const lag = bundleCommit && head && bundleCommit !== head ? `; commit de origem ${curto(bundleCommit)} fica um para tras por construcao` : '';
    if (mal.length === 0) out.push({ afirmacao: 'bundle cobre o HEAD', rotulo: 'verified', porque: `conteudo: ${conteudo.total} ficheiros com sha256 igual ao HEAD${lag}` });
    else out.push({ afirmacao: 'bundle cobre o HEAD', rotulo: 'failed', porque: `conteudo: ${mal.length} ficheiro(s) diferem do HEAD`, exemplos: mal.slice(0, 5) });
  } else if (!bundleCommit) out.push({ afirmacao: 'bundle de recuperacao datado', rotulo: 'unknown', porque: 'source_commit ausente' });
  else if (ficheirosAlterados === null) out.push({ afirmacao: `bundle em ${curto(bundleCommit)} vs HEAD`, rotulo: 'unknown', porque: 'commit do bundle nao esta no historico local (clone raso?)' });
  else if (ficheirosAlterados.length === 0) out.push({ afirmacao: 'bundle cobre o HEAD', rotulo: 'verified', porque: 'nenhum ficheiro fora de recovery/ mudou desde o commit do bundle' });
  else out.push({ afirmacao: 'bundle cobre o HEAD', rotulo: 'failed', porque: `${ficheirosAlterados.length} ficheiro(s) mudaram desde ${curto(bundleCommit)}`, exemplos: ficheirosAlterados.slice(0, 5) });

  if (ledgerTexto == null) out.push({ afirmacao: 'livro razao refere o HEAD', rotulo: 'unknown', porque: 'sem --ledger; o sandbox pode nao alcançar a base, exporta as linhas recentes de ora_mudancas' });
  else if (head && ledgerTexto.includes(curto(head))) out.push({ afirmacao: 'livro razao refere o HEAD', rotulo: 'verified', porque: `${curto(head)} citado` });
  else out.push({ afirmacao: 'livro razao refere o HEAD', rotulo: 'failed', porque: 'nenhuma linha cita o HEAD actual: trabalho sem registo' });
  return out;
}

const excluidoDoBundle = (p) => p === 'recovery/orum-recovery-bundle.json' || /^recovery\/orum-recovery-bundle-\d+\.json$/.test(p);

// Funcao pura: compara mapas path -> sha256.
export function compararConteudo(headFiles, bundleFiles) {
  const missing = [], differing = [], extra = [];
  for (const [p, h] of headFiles) {
    if (!bundleFiles.has(p)) missing.push(p);
    else if (bundleFiles.get(p) !== h) differing.push(p);
  }
  for (const p of bundleFiles.keys()) if (!headFiles.has(p)) extra.push(p);
  return { missing: missing.sort(), differing: differing.sort(), extra: extra.sort(), total: headFiles.size };
}

// sha256 de cada ficheiro do HEAD, lido do objecto git (um unico processo git cat-file --batch).
function lerHead() {
  const nomes = git('ls-tree', '-r', '--name-only', 'HEAD').split('\n').filter((p) => p && !excluidoDoBundle(p));
  const r = spawnSync('git', ['cat-file', '--batch'], { cwd: raiz, input: nomes.map((n) => `HEAD:${n}\n`).join(''), maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  const buf = r.stdout; const mapa = new Map(); let pos = 0;
  for (const n of nomes) {
    const fim = buf.indexOf(0x0a, pos); if (fim < 0) return null;
    const cab = buf.subarray(pos, fim).toString('utf8').split(' ');
    if (cab[1] !== 'blob') return null;
    const tam = Number(cab[2]); const ini = fim + 1;
    mapa.set(n, createHash('sha256').update(buf.subarray(ini, ini + tam)).digest('hex'));
    pos = ini + tam + 1;
  }
  return mapa;
}

function lerBundle() {
  try {
    const dir = join(raiz, 'recovery');
    const mapa = new Map();
    for (const nome of readdirSync(dir).filter((f) => /^orum-recovery-bundle-\d+\.json$/.test(f)).sort()) {
      for (const f of JSON.parse(readFileSync(join(dir, nome), 'utf8')).files) mapa.set(f.path, f.sha256);
    }
    return mapa.size ? mapa : null;
  } catch { return null; }
}

function observar(ledgerCaminho) {
  const head = git('rev-parse', 'HEAD');
  const bundleCommit = JSON.parse(readFileSync(join(raiz, 'recovery/orum-recovery-bundle.json'), 'utf8')).source_commit;
  let ficheirosAlterados = null;
  try {
    ficheirosAlterados = git('diff', '--name-only', bundleCommit, 'HEAD').split('\n').filter((f) => f && !f.startsWith('recovery/'));
  } catch { /* commit ausente */ }
  const ledgerTexto = ledgerCaminho ? readFileSync(ledgerCaminho, 'utf8') : null;
  const h = lerHead(), b = lerBundle();
  const conteudo = h && b ? compararConteudo(h, b) : null;
  return avaliar({ head, bundleCommit, ficheirosAlterados, conteudo, ledgerTexto });
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
  // por conteudo: o commit de origem pode ficar atras sem ser falha
  const ok = { missing: [], differing: [], extra: [], total: 3 };
  assert.equal(r({ ficheirosAlterados: ['x.js'], conteudo: ok }), 'verified,verified,unknown');
  assert.equal(r({ conteudo: { ...ok, differing: ['a.js'] } }), 'verified,failed,unknown');
  assert.equal(r({ conteudo: { ...ok, missing: ['n.js'] } }), 'verified,failed,unknown');
  assert.equal(r({ conteudo: { ...ok, extra: ['velho.js'] } }), 'verified,failed,unknown');
  const A = new Map([['a', '1'], ['b', '2']]);
  assert.deepEqual(compararConteudo(A, new Map([['a', '1'], ['b', '2']])), { missing: [], differing: [], extra: [], total: 2 });
  assert.deepEqual(compararConteudo(A, new Map([['a', '9'], ['c', '3']])), { missing: ['b'], differing: ['a'], extra: ['c'], total: 2 });
  console.log('self-test ok');
} else {
  const i = process.argv.indexOf('--ledger');
  const res = observar(i > 0 ? process.argv[i + 1] : null);
  for (const x of res) console.log(`${x.rotulo.padEnd(8)} ${x.afirmacao} — ${x.porque}${x.exemplos ? ' [' + x.exemplos.join(', ') + ']' : ''}`);
  if (process.argv.includes('--strict') && res.some((x) => x.rotulo !== 'verified')) process.exit(1);
}
