import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verificar } from '../kit/verificar.mjs';

const FICHEIROS = ['sensacoes/oro-v1.json', 'ancora/oro-v1.json', 'ancora/oro-v1.ots'];

function copia(mutar) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orum-kit-'));
  for (const f of FICHEIROS) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(f, path.join(dir, f));
  }
  mutar?.(dir);
  return dir;
}
const editarJson = (dir, f, fn) => {
  const p = path.join(dir, f);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  fn(j);
  fs.writeFileSync(p, JSON.stringify(j));
};

const limpa = copia();
const r = verificar(limpa);
assert.equal(r.ok, true);
assert.match(r.estado, /^(pendente|confirmado no bloco)/);
assert.equal(Object.keys(r.impressoes).length, 3);
console.log(`Kit: ${r.estado}`);

const rejeita = (nome, mutar) => {
  const dir = copia(mutar);
  assert.throws(() => verificar(dir), undefined, `estrago não apanhado: ${nome}`);
};
rejeita('byte do recibo mudado', (d) => { const p = path.join(d, 'ancora/oro-v1.ots'); const b = fs.readFileSync(p); b[40] ^= 1; fs.writeFileSync(p, b); });
rejeita('recibo truncado', (d) => { const p = path.join(d, 'ancora/oro-v1.ots'); fs.writeFileSync(p, fs.readFileSync(p).subarray(0, 300)); });
rejeita('hash da cápsula alterado', (d) => editarJson(d, 'sensacoes/oro-v1.json', (j) => { j.integrity.sha256 = '0'.repeat(64); }));
rejeita('hash da cápsula inválido', (d) => editarJson(d, 'sensacoes/oro-v1.json', (j) => { j.integrity.sha256 = 'xyz'; }));
rejeita('manifesto com outro hash', (d) => editarJson(d, 'ancora/oro-v1.json', (j) => { j.digest_sha256 = '1'.repeat(64); }));
rejeita('manifesto diz confirmado sem Bitcoin', (d) => editarJson(d, 'ancora/oro-v1.json', (j) => { j.estado = 'confirmado_bitcoin'; j.altura_bitcoin = 900000; }));
rejeita('manifesto perdeu a fronteira "não prova"', (d) => editarJson(d, 'ancora/oro-v1.json', (j) => { j.prova = 'Prova valor.'; }));
rejeita('recibo em falta', (d) => fs.rmSync(path.join(d, 'ancora/oro-v1.ots')));
console.log('Estragos propositados apanhados: 8.');
