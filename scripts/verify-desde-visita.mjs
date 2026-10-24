import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const fonte = fs.readFileSync(new URL('../desde-visita-v1.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../verdelaranja.js', import.meta.url), 'utf8');

function carregar(src) { const ctx = { Date, JSON, Set, Array, Number }; ctx.globalThis = ctx; vm.runInNewContext(src, ctx); return ctx.ORUMDesdeVisita; }
function casos(D) {
  const agora = Date.parse('2026-10-24T12:00:00Z');
  const ev = (quando, detalhe = 'x') => ({ tipo: 't', quando, detalhe });
  assert.equal(D.comparar([ev('2026-10-24T11:00:00Z')], null, agora).estado, 'primeira');
  assert.equal(D.comparar([ev('2026-10-24T11:00:00Z')], 'lixo', agora).estado, 'primeira');
  assert.equal(D.comparar([], '2026-10-24T10:00:00Z', agora).estado, 'nada');
  assert.equal(D.comparar(undefined, '2026-10-24T10:00:00Z', agora).estado, 'nada');
  assert.equal(D.comparar([ev('2026-10-24T09:00:00Z')], '2026-10-24T10:00:00Z', agora).estado, 'nada');
  assert.equal(D.comparar([ev('2026-10-24T10:00:00Z')], '2026-10-24T10:00:00Z', agora).estado, 'nada', 'igual à visita não é novo');
  const r = D.comparar([ev('2026-10-24T11:00:00Z'), ev('2026-10-24T11:00:00Z'), ev('2026-10-24T09:00:00Z'), ev('sem hora'), ev('2026-10-25T00:00:00Z')], '2026-10-24T10:00:00Z', agora);
  assert.equal(r.estado, 'novos'); assert.equal(r.novos.length, 1, 'duplicados, antigos, sem hora e futuros não contam');
  assert.equal(D.comparar([ev('2026-10-24T11:00:00Z')], '2026-10-25T00:00:00Z', agora).estado, 'primeira', 'visita no futuro é relógio errado');
  const store = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; } };
  assert.equal(D.guardar(store, 'a'), true); assert.equal(D.ler(store), 'a');
  const quebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.equal(D.ler(quebrado), null); assert.equal(D.guardar(quebrado, 'a'), false);
}
casos(carregar(fonte));
assert.match(html, /src="\/desde-visita-v1\.js"/);
assert.match(html, /id="sinceSummary"/); assert.match(html, /id="sinceList"/);
assert.match(app, /desdeVisita\(data\.eventos\)/);
assert.doesNotMatch(fonte, /fetch|XMLHttpRequest|sendBeacon/, 'o bloco não escreve nem lê da rede');
assert.doesNotMatch(html + app + fonte, /receita garantida|reembolso garantido/i);

// estragos propositados: cada um tem de fazer falhar os casos ou as verificações
const estragos = [
  ['aceita igual à visita', s => s.replace('t <= t0', 't < t0')],
  ['aceita futuros', s => s.replace(' || t > agora) return false', ') return false')],
  ['não deduplica', s => s.replace('if (vistos.has(k)) return false;', '')],
  ['visita inválida conta como nada', s => s.replace('!Number.isFinite(t0) || t0 > agora', 'false')],
  ['rede no bloco', s => s + '\nfetch("/x");'],
  ['guardar não protege', s => s.replace('try { store.setItem(CHAVE, quando); return true; } catch (_) { return false; }', 'store.setItem(CHAVE, quando); return true;')],
];
let apanhados = 0;
for (const [nome, f] of estragos) {
  const mutado = f(fonte); assert.notEqual(mutado, fonte, 'estrago sem efeito: ' + nome);
  let caiu = false;
  try { casos(carregar(mutado)); assert.doesNotMatch(mutado, /fetch|XMLHttpRequest|sendBeacon/); } catch (_) { caiu = true; }
  assert.ok(caiu, 'estrago não apanhado: ' + nome); apanhados++;
}
console.log(JSON.stringify({ verified: true, casos: 'ok', estragos_apanhados: apanhados }));
