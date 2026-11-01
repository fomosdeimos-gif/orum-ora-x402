import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { verificarRaiz, manifestosDeCamadas } from '../kit/raiz.mjs';
import { lerRecibo } from './lib/ots.mjs';
import { nomeCamada, caminhosDaCamada, ficheirosDaCamada, escolherCaminhos, FICHEIROS, FICHEIROS_DA_CAMADA_4_EM_DIANTE, FICHEIROS_DA_CAMADA_5_EM_DIANTE, FICHEIROS_DA_CAMADA_6_EM_DIANTE, FICHEIROS_DA_CAMADA_7_EM_DIANTE, FICHEIROS_DA_CAMADA_8_EM_DIANTE, FICHEIROS_DA_CAMADA_9_EM_DIANTE, FICHEIROS_DA_CAMADA_10_EM_DIANTE, FICHEIROS_DA_CAMADA_11_EM_DIANTE, FICHEIROS_DA_CAMADA_12_EM_DIANTE, FICHEIROS_DA_CAMADA_13_EM_DIANTE, FICHEIROS_DA_CAMADA_14_EM_DIANTE, FICHEIROS_DA_CAMADA_15_EM_DIANTE, FICHEIROS_DA_CAMADA_16_EM_DIANTE, FICHEIROS_DA_CAMADA_17_EM_DIANTE, FICHEIROS_DA_CAMADA_18_EM_DIANTE } from './lib/raiz.mjs';

function verificarCamada(caminhoManifesto) {
  const manifestoBytes = fs.readFileSync(caminhoManifesto);
  const manifesto = JSON.parse(manifestoBytes);
  const reciboBytes = fs.readFileSync(manifesto.recibo);
  const ler = (p) => execFileSync('git', ['show', `${manifesto.commit_base}:${p}`], { maxBuffer: 64 * 1024 * 1024 });

  const ok = verificarRaiz({ ler, manifestoBytes, reciboBytes });
  assert.match(ok.estado, /^(pendente|confirmado no bloco)/);
  assert.equal(lerRecibo(reciboBytes).digest, manifesto.raiz_sha256);
  console.log(`Camada ${manifesto.camada ?? 1}: raiz ${ok.raiz.slice(0, 12)}… (${ok.estado}) de ${ok.ficheiros} ficheiros do commit ${manifesto.commit_base.slice(0, 7)}`);

  const rejeita = (nome, fn) => assert.throws(fn, undefined, `estrago não apanhado: ${nome}`);
  const com = (mut) => { const m = JSON.parse(manifestoBytes); mut(m); return Buffer.from(JSON.stringify(m)); };
  const mutRecibo = (i) => { const b = Buffer.from(reciboBytes); b[i] ^= 1; return b; };

  rejeita('ficheiro alterado', () => verificarRaiz({ ler: (p) => (p === 'CLAUDE.md' ? Buffer.from('mentira') : ler(p)), manifestoBytes, reciboBytes }));
  rejeita('ficheiro em falta', () => verificarRaiz({ ler: (p) => { if (p === 'kit/verificar.mjs') throw new Error('em falta'); return ler(p); }, manifestoBytes, reciboBytes }));
  rejeita('hash de um ficheiro mudado no manifesto', () => verificarRaiz({ ler, manifestoBytes: com((m) => { m.ficheiros[0].sha256 = '0'.repeat(64); }), reciboBytes }));
  rejeita('raiz do manifesto alterada', () => verificarRaiz({ ler, manifestoBytes: com((m) => { m.raiz_sha256 = '1'.repeat(64); }), reciboBytes }));
  rejeita('ficheiro retirado da lista', () => verificarRaiz({ ler, manifestoBytes: com((m) => { m.ficheiros = m.ficheiros.slice(1); }), reciboBytes }));
  rejeita('byte do hash no recibo mudado', () => verificarRaiz({ ler, manifestoBytes, reciboBytes: mutRecibo(40) }));
  rejeita('recibo truncado', () => verificarRaiz({ ler, manifestoBytes, reciboBytes: reciboBytes.subarray(0, 200) }));
  rejeita('manifesto diz confirmado sem Bitcoin', () => verificarRaiz({ ler, manifestoBytes: com((m) => { m.estado = 'confirmado_bitcoin'; m.altura_bitcoin = 900000; }), reciboBytes }));
  if (/^confirmado/.test(ok.estado)) rejeita('manifesto pendente com o recibo já confirmado', () => verificarRaiz({ ler, manifestoBytes: com((m) => { m.estado = 'pendente'; m.altura_bitcoin = null; }), reciboBytes }));
  rejeita('manifesto perdeu a fronteira "não prova"', () => verificarRaiz({ ler, manifestoBytes: com((m) => { m.prova = 'Prova valor.'; }), reciboBytes }));
  rejeita('schema desconhecido', () => verificarRaiz({ ler, manifestoBytes: com((m) => { m.schema = 'outro'; }), reciboBytes }));
  return /^confirmado/.test(ok.estado) ? 11 : 10;

}

const camadas = manifestosDeCamadas('.');
assert.ok(camadas.length >= 1 && camadas[0] === 'ancora/raiz-registos.json', 'falta a camada 1');
let estragos = 0;
for (const c of camadas) estragos += verificarCamada(c);
console.log(`Estragos propositados apanhados: ${estragos} (em ${camadas.length} camada(s)).`);

// Regras de sedimentação: camadas que se acrescentam e não se reescrevem.
assert.equal(nomeCamada(1), 'ancora/raiz-registos');
assert.equal(nomeCamada(2), 'ancora/raiz-registos-2');
assert.throws(() => nomeCamada(0), /camada inválida/);
assert.deepEqual(ficheirosDaCamada(1), FICHEIROS, 'a lista da camada 1 não pode mudar');
const f2 = ficheirosDaCamada(2);
for (const x of ['ancora/raiz-registos.json', 'ancora/raiz-registos.ots', 'ancora/arquivos-wayback.json', 'kit/blocos.mjs', ...FICHEIROS]) assert.ok(f2.includes(x), `a camada 2 devia selar ${x}`);
const f3 = ficheirosDaCamada(3);
assert.ok(f3.includes('ancora/raiz-registos-2.json') && f3.includes('ancora/raiz-registos-2.ots') && f3.includes('ancora/raiz-registos.json'), 'a camada 3 sela as anteriores');
assert.equal(new Set(f3).size, f3.length, 'caminho repetido');
const f4 = ficheirosDaCamada(4);
assert.ok(f4.includes('ancora/raiz-registos-3.json') && f4.includes('ancora/raiz-registos-3.ots'), 'a camada 4 sela a 3');
for (const x of FICHEIROS_DA_CAMADA_4_EM_DIANTE) { assert.ok(f4.includes(x), `a camada 4 devia selar ${x}`); assert.ok(!f3.includes(x), `a camada 3 não pode mudar: ${x}`); }
assert.equal(new Set(f4).size, f4.length, 'caminho repetido na camada 4');
const f5 = ficheirosDaCamada(5);
assert.ok(f5.includes('ancora/raiz-registos-4.json') && f5.includes('ancora/raiz-registos-4.ots'), 'a camada 5 sela a 4');
for (const x of FICHEIROS_DA_CAMADA_5_EM_DIANTE) { assert.ok(f5.includes(x), `a camada 5 devia selar ${x}`); assert.ok(!f4.includes(x), `a camada 4 não pode mudar: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_4_EM_DIANTE) assert.ok(f5.includes(x), `a camada 5 tem de continuar a selar ${x}`);
assert.equal(new Set(f5).size, f5.length, 'caminho repetido na camada 5');
for (const x of FICHEIROS_DA_CAMADA_5_EM_DIANTE) assert.ok(fs.existsSync(x), `o ficheiro da camada 5 tem de existir: ${x}`);
const f6 = ficheirosDaCamada(6);
assert.ok(f6.includes('ancora/raiz-registos-5.json') && f6.includes('ancora/raiz-registos-5.ots'), 'a camada 6 sela a 5');
for (const x of FICHEIROS_DA_CAMADA_6_EM_DIANTE) { assert.ok(f6.includes(x), `a camada 6 devia selar ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 6 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_5_EM_DIANTE) assert.ok(f6.includes(x), `a camada 6 tem de continuar a selar ${x}`);
assert.equal(new Set(f6).size, f6.length, 'caminho repetido na camada 6');
const f7 = ficheirosDaCamada(7);
assert.ok(f7.includes('ancora/raiz-registos-6.json') && f7.includes('ancora/raiz-registos-6.ots'), 'a camada 7 sela a 6');
for (const x of FICHEIROS_DA_CAMADA_7_EM_DIANTE) { assert.ok(f7.includes(x), `a camada 7 devia selar ${x}`); assert.ok(!f6.includes(x), `a camada 6 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 7 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_6_EM_DIANTE) assert.ok(f7.includes(x), `a camada 7 tem de continuar a selar ${x}`);
assert.equal(new Set(f7).size, f7.length, 'caminho repetido na camada 7');
const f8 = ficheirosDaCamada(8);
assert.ok(f8.includes('ancora/raiz-registos-7.json') && f8.includes('ancora/raiz-registos-7.ots'), 'a camada 8 sela a 7');
for (const x of FICHEIROS_DA_CAMADA_8_EM_DIANTE) { assert.ok(f8.includes(x), `a camada 8 devia selar ${x}`); assert.ok(!f7.includes(x), `a camada 7 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 8 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_7_EM_DIANTE) assert.ok(f8.includes(x), `a camada 8 tem de continuar a selar ${x}`);
assert.equal(new Set(f8).size, f8.length, 'caminho repetido na camada 8');
const f9 = ficheirosDaCamada(9);
assert.ok(f9.includes('ancora/raiz-registos-8.json') && f9.includes('ancora/raiz-registos-8.ots'), 'a camada 9 sela a 8');
for (const x of FICHEIROS_DA_CAMADA_9_EM_DIANTE) { assert.ok(f9.includes(x), `a camada 9 devia selar ${x}`); assert.ok(!f8.includes(x), `a camada 8 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 9 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_8_EM_DIANTE) assert.ok(f9.includes(x), `a camada 9 tem de continuar a selar ${x}`);
assert.equal(new Set(f9).size, f9.length, 'caminho repetido na camada 9');
const f10 = ficheirosDaCamada(10);
assert.ok(f10.includes('ancora/raiz-registos-9.json') && f10.includes('ancora/raiz-registos-9.ots'), 'a camada 10 sela a 9');
for (const x of FICHEIROS_DA_CAMADA_10_EM_DIANTE) { assert.ok(f10.includes(x), `a camada 10 devia selar ${x}`); assert.ok(!f9.includes(x), `a camada 9 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 10 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_9_EM_DIANTE) assert.ok(f10.includes(x), `a camada 10 tem de continuar a selar ${x}`);
assert.equal(new Set(f10).size, f10.length, 'caminho repetido na camada 10');
const f11 = ficheirosDaCamada(11);
assert.ok(f11.includes('ancora/raiz-registos-10.json') && f11.includes('ancora/raiz-registos-10.ots'), 'a camada 11 sela a 10');
for (const x of FICHEIROS_DA_CAMADA_11_EM_DIANTE) { assert.ok(f11.includes(x), `a camada 11 devia selar ${x}`); assert.ok(!f10.includes(x), `a camada 10 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 11 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_10_EM_DIANTE) assert.ok(f11.includes(x), `a camada 11 tem de continuar a selar ${x}`);
assert.equal(new Set(f11).size, f11.length, 'caminho repetido na camada 11');
const f12 = ficheirosDaCamada(12);
assert.ok(f12.includes('ancora/raiz-registos-11.json') && f12.includes('ancora/raiz-registos-11.ots'), 'a camada 12 sela a 11');
for (const x of FICHEIROS_DA_CAMADA_12_EM_DIANTE) { assert.ok(f12.includes(x), `a camada 12 devia selar ${x}`); assert.ok(!f11.includes(x), `a camada 11 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 12 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_11_EM_DIANTE) assert.ok(f12.includes(x), `a camada 12 tem de continuar a selar ${x}`);
assert.equal(new Set(f12).size, f12.length, 'caminho repetido na camada 12');
const f13 = ficheirosDaCamada(13);
assert.ok(f13.includes('ancora/raiz-registos-12.json') && f13.includes('ancora/raiz-registos-12.ots'), 'a camada 13 sela a 12');
for (const x of FICHEIROS_DA_CAMADA_13_EM_DIANTE) { assert.ok(f13.includes(x), `a camada 13 devia selar ${x}`); assert.ok(!f12.includes(x), `a camada 12 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 13 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_12_EM_DIANTE) assert.ok(f13.includes(x), `a camada 13 tem de continuar a selar ${x}`);
assert.equal(new Set(f13).size, f13.length, 'caminho repetido na camada 13');
const f14 = ficheirosDaCamada(14);
assert.ok(f14.includes('ancora/raiz-registos-13.json') && f14.includes('ancora/raiz-registos-13.ots'), 'a camada 14 sela a 13');
for (const x of FICHEIROS_DA_CAMADA_14_EM_DIANTE) { assert.ok(f14.includes(x), `a camada 14 devia selar ${x}`); assert.ok(!f13.includes(x), `a camada 13 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 14 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_13_EM_DIANTE) assert.ok(f14.includes(x), `a camada 14 tem de continuar a selar ${x}`);
assert.equal(new Set(f14).size, f14.length, 'caminho repetido na camada 14');
const f15 = ficheirosDaCamada(15);
assert.ok(f15.includes('ancora/raiz-registos-14.json') && f15.includes('ancora/raiz-registos-14.ots'), 'a camada 15 sela a 14');
for (const x of FICHEIROS_DA_CAMADA_15_EM_DIANTE) { assert.ok(f15.includes(x), `a camada 15 devia selar ${x}`); assert.ok(!f14.includes(x), `a camada 14 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 15 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_14_EM_DIANTE) assert.ok(f15.includes(x), `a camada 15 tem de continuar a selar ${x}`);
assert.equal(new Set(f15).size, f15.length, 'caminho repetido na camada 15');
const f16 = ficheirosDaCamada(16);
assert.ok(f16.includes('ancora/raiz-registos-15.json') && f16.includes('ancora/raiz-registos-15.ots'), 'a camada 16 sela a 15');
for (const x of FICHEIROS_DA_CAMADA_16_EM_DIANTE) { assert.ok(f16.includes(x), `a camada 16 devia selar ${x}`); assert.ok(!f15.includes(x), `a camada 15 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 16 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_15_EM_DIANTE) assert.ok(f16.includes(x), `a camada 16 tem de continuar a selar ${x}`);
assert.equal(new Set(f16).size, f16.length, 'caminho repetido na camada 16');
const f17 = ficheirosDaCamada(17);
assert.ok(f17.includes('ancora/raiz-registos-16.json') && f17.includes('ancora/raiz-registos-16.ots'), 'a camada 17 sela a 16');
for (const x of FICHEIROS_DA_CAMADA_17_EM_DIANTE) { assert.ok(f17.includes(x), `a camada 17 devia selar ${x}`); assert.ok(!f16.includes(x), `a camada 16 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 17 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_16_EM_DIANTE) assert.ok(f17.includes(x), `a camada 17 tem de continuar a selar ${x}`);
assert.equal(new Set(f17).size, f17.length, 'caminho repetido na camada 17');
const f18 = ficheirosDaCamada(18);
assert.ok(f18.includes('ancora/raiz-registos-17.json') && f18.includes('ancora/raiz-registos-17.ots'), 'a camada 18 sela a 17');
for (const x of FICHEIROS_DA_CAMADA_18_EM_DIANTE) { assert.ok(f18.includes(x), `a camada 18 devia selar ${x}`); assert.ok(!f17.includes(x), `a camada 17 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 18 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_17_EM_DIANTE) assert.ok(f18.includes(x), `a camada 18 tem de continuar a selar ${x}`);
assert.equal(new Set(f18).size, f18.length, 'caminho repetido na camada 18');
const existentes = new Set(['ancora/raiz-registos.json', 'ancora/raiz-registos.ots']);
assert.deepEqual(escolherCaminhos(2, (p) => existentes.has(p)), caminhosDaCamada(2));
assert.throws(() => escolherCaminhos(1, (p) => existentes.has(p)), /já existe/, 'estrago não apanhado: reescrever a camada 1');
assert.throws(() => escolherCaminhos(2, (p) => existentes.has(p) || p === 'ancora/raiz-registos-2.json'), /já existe/, 'estrago não apanhado: reescrever a camada 2');
assert.throws(() => escolherCaminhos(3, (p) => existentes.has(p)), /falta a camada 2/, 'estrago não apanhado: saltar uma camada');
console.log('Regras de camadas conferidas: 3 estragos propositados apanhados.');
