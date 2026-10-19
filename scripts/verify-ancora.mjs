import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lerRecibo } from './lib/ots.mjs';

const capsule = JSON.parse(fs.readFileSync('sensacoes/oro-v1.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('ancora/oro-v1.json', 'utf8'));
const recibo = fs.readFileSync(manifest.recibo);

function verificar(buf, m, sha) {
  const r = lerRecibo(buf);
  assert.equal(r.digest, sha, 'o recibo não sela o hash da obra');
  assert.equal(m.digest_sha256, sha, 'o manifesto não diz o hash da obra');
  assert.ok(r.atestacoes.length > 0, 'recibo sem atestações');
  const btc = r.atestacoes.filter((a) => a.tipo === 'bitcoin');
  const pend = r.atestacoes.filter((a) => a.tipo === 'pendente');
  assert.ok(!r.atestacoes.some((a) => a.tipo === 'desconhecida'), 'atestação desconhecida');
  if (m.estado === 'confirmado_bitcoin') {
    assert.ok(btc.length > 0, 'diz confirmado sem atestação Bitcoin no recibo');
    assert.equal(m.altura_bitcoin, Math.min(...btc.map((a) => a.altura)), 'altura do manifesto não é a do recibo');
  } else {
    assert.equal(m.estado, 'pendente');
    assert.equal(m.altura_bitcoin, null);
    assert.equal(btc.length, 0, 'recibo já tem atestação Bitcoin: actualizar o manifesto');
    assert.ok(pend.length > 0, 'pendente sem calendário');
  }
  assert.match(m.prova, /Não prova autoria, valor, procura nem receita/);
  return { r, btc, pend };
}

const { r, pend } = verificar(recibo, manifest, capsule.integrity.sha256);
console.log(`Âncora ORO: ${r.atestacoes.length} atestações (${manifest.estado}); calendários: ${pend.map((p) => p.calendario).join(', ')}`);

const rejeita = (nome, fn) => { assert.throws(fn, undefined, `estrago não apanhado: ${nome}`); };
const mut = (i) => { const b = Buffer.from(recibo); b[i] ^= 1; return b; };
rejeita('byte do hash mudado', () => verificar(mut(40), manifest, capsule.integrity.sha256));
rejeita('hash da cápsula alterado', () => verificar(recibo, manifest, '0'.repeat(64)));
rejeita('manifesto com outro hash', () => verificar(recibo, { ...manifest, digest_sha256: '1'.repeat(64) }, capsule.integrity.sha256));
rejeita('confirmado sem Bitcoin', () => verificar(recibo, { ...manifest, estado: 'confirmado_bitcoin', altura_bitcoin: 900000 }, capsule.integrity.sha256));
rejeita('recibo truncado', () => verificar(recibo.subarray(0, 300), manifest, capsule.integrity.sha256));
rejeita('cabeçalho trocado', () => verificar(mut(3), manifest, capsule.integrity.sha256));
rejeita('prova a prometer valor', () => verificar(recibo, { ...manifest, prova: 'Prova valor.' }, capsule.integrity.sha256));
rejeita('bytes a mais', () => verificar(Buffer.concat([recibo, Buffer.from([0])]), manifest, capsule.integrity.sha256));
console.log('Estragos propositados apanhados: 8.');
