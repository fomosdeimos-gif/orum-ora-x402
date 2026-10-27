// Verifica o elo 0001sensations-Bitcoin (ancora/sensations-btc.json): o real passa e cada mentira propositada falha.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { calcular, verificar } from '../kit/sensations-btc.mjs';
import { ficheirosDaCamada, FICHEIROS_DA_CAMADA_3_EM_DIANTE } from './lib/raiz.mjs';

const real = verificar('.');
assert.equal(real.total, fs.readdirSync('sensacoes').filter((f) => f.endsWith('.json')).length);
assert.ok(real.ancorados >= 1, 'o ORO tem de estar ancorado');

// a camada 3 em diante sela todas as cápsulas; a 1 e a 2 ficam como estavam seladas
for (const f of fs.readdirSync('sensacoes').filter((x) => x.endsWith('.json'))) {
  const c = `sensacoes/${f}`;
  assert.ok(ficheirosDaCamada(3).includes(c), `a camada 3 devia selar ${c}`);
}
assert.ok(FICHEIROS_DA_CAMADA_3_EM_DIANTE.includes('linhas/orum.linhas'));
assert.ok(!ficheirosDaCamada(2).includes('linhas/orum.linhas'), 'a camada 2 não pode mudar');
assert.ok(!ficheirosDaCamada(2).includes('sensacoes/som-v1.json'), 'a camada 2 não pode mudar');

const FICHEIROS = [...fs.readdirSync('ancora').filter((f) => /^raiz-registos(-\d+)?\.json$/.test(f)).map((f) => `ancora/${f}`), 'ancora/oro-v1.json', 'ancora/sensations-btc.json', ...fs.readdirSync('sensacoes').map((f) => `sensacoes/${f}`)];
let mentiras = 0;
const falha = (nome, mutar) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orum-elo-'));
  for (const f of FICHEIROS) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.copyFileSync(f, path.join(dir, f)); }
  assert.doesNotThrow(() => verificar(dir), 'a cópia limpa devia passar');
  mutar(dir);
  assert.throws(() => verificar(dir), undefined, `estrago não apanhado: ${nome}`);
  mentiras++;
};
const editar = (dir, f, fn) => { const p = path.join(dir, f); const j = JSON.parse(fs.readFileSync(p, 'utf8')); fn(j); fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n'); };

falha('cápsula alterada depois de registada', (d) => fs.appendFileSync(path.join(d, 'sensacoes/som-v1.json'), ' '));
falha('ORO alterado depois da âncora', (d) => fs.appendFileSync(path.join(d, 'sensacoes/oro-v1.json'), ' '));
falha('hash do registo mudado', (d) => editar(d, 'ancora/sensations-btc.json', (j) => { j.ficheiros[0].sha256 = '0'.repeat(64); }));
falha('obra ancorada passa a não ancorada', (d) => editar(d, 'ancora/sensations-btc.json', (j) => { j.ficheiros[0].estado = 'nao_ancorado'; }));
falha('altura de bloco inventada', (d) => editar(d, 'ancora/sensations-btc.json', (j) => { const o = j.ficheiros.find((f) => f.caminho === 'sensacoes/oro-v1.json'); o.camadas[0].altura_bitcoin = 1; }));
falha('âncora directa inventada para outra obra', (d) => editar(d, 'ancora/sensations-btc.json', (j) => { j.ficheiros[0].ancora_directa = { altura_bitcoin: 972115 }; }));
falha('camada deixa de estar confirmada', (d) => editar(d, 'ancora/raiz-registos-2.json', (j) => { j.estado = 'pendente'; }));
falha('fronteira "não prova" retirada', (d) => editar(d, 'ancora/sensations-btc.json', (j) => { j.prova = 'Prova valor.'; }));
falha('limites retirados (107 obras e 65 NFTs)', (d) => editar(d, 'ancora/sensations-btc.json', (j) => { j.nao_cobre = []; }));
falha('contagem inflacionada', (d) => editar(d, 'ancora/sensations-btc.json', (j) => { j.ancorados = j.total + 1; }));
falha('registo apagado', (d) => fs.rmSync(path.join(d, 'ancora/sensations-btc.json')));

console.log(JSON.stringify({ verified: true, ...real, casos_de_mentira: mentiras }));
