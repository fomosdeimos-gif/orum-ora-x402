import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { verificarRaiz, manifestosDeCamadas } from '../kit/raiz.mjs';
import { lerRecibo } from './lib/ots.mjs';
import { nomeCamada, caminhosDaCamada, ficheirosDaCamada, escolherCaminhos, FICHEIROS, FICHEIROS_DA_CAMADA_4_EM_DIANTE, FICHEIROS_DA_CAMADA_5_EM_DIANTE, FICHEIROS_DA_CAMADA_6_EM_DIANTE, FICHEIROS_DA_CAMADA_7_EM_DIANTE, FICHEIROS_DA_CAMADA_8_EM_DIANTE, FICHEIROS_DA_CAMADA_9_EM_DIANTE, FICHEIROS_DA_CAMADA_10_EM_DIANTE, FICHEIROS_DA_CAMADA_11_EM_DIANTE, FICHEIROS_DA_CAMADA_12_EM_DIANTE, FICHEIROS_DA_CAMADA_13_EM_DIANTE, FICHEIROS_DA_CAMADA_14_EM_DIANTE, FICHEIROS_DA_CAMADA_15_EM_DIANTE, FICHEIROS_DA_CAMADA_16_EM_DIANTE, FICHEIROS_DA_CAMADA_17_EM_DIANTE, FICHEIROS_DA_CAMADA_18_EM_DIANTE, FICHEIROS_DA_CAMADA_19_EM_DIANTE, FICHEIROS_DA_CAMADA_20_EM_DIANTE, FICHEIROS_DA_CAMADA_23_EM_DIANTE, FICHEIROS_DA_CAMADA_24_EM_DIANTE, FICHEIROS_DA_CAMADA_26_EM_DIANTE, FICHEIROS_DA_CAMADA_27_EM_DIANTE, FICHEIROS_DA_CAMADA_28_EM_DIANTE, FICHEIROS_DA_CAMADA_29_EM_DIANTE, FICHEIROS_DA_CAMADA_30_EM_DIANTE, FICHEIROS_DA_CAMADA_31_EM_DIANTE, FICHEIROS_DA_CAMADA_32_EM_DIANTE } from './lib/raiz.mjs';

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
const f19 = ficheirosDaCamada(19);
assert.ok(f19.includes('ancora/raiz-registos-18.json') && f19.includes('ancora/raiz-registos-18.ots'), 'a camada 19 sela a 18');
for (const x of FICHEIROS_DA_CAMADA_19_EM_DIANTE) { assert.ok(f19.includes(x), `a camada 19 devia selar ${x}`); assert.ok(!f18.includes(x), `a camada 18 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 19 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_18_EM_DIANTE) assert.ok(f19.includes(x), `a camada 19 tem de continuar a selar ${x}`);
assert.equal(new Set(f19).size, f19.length, 'caminho repetido na camada 19');
const f20 = ficheirosDaCamada(20);
assert.ok(f20.includes('ancora/raiz-registos-19.json') && f20.includes('ancora/raiz-registos-19.ots'), 'a camada 20 sela a 19');
for (const x of FICHEIROS_DA_CAMADA_20_EM_DIANTE) { assert.ok(f20.includes(x), `a camada 20 devia selar ${x}`); assert.ok(!f19.includes(x), `a camada 19 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 20 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_19_EM_DIANTE) assert.ok(f20.includes(x), `a camada 20 tem de continuar a selar ${x}`);
assert.equal(new Set(f20).size, f20.length, 'caminho repetido na camada 20');
const f21 = ficheirosDaCamada(21);
assert.ok(f21.includes('ancora/raiz-registos-20.json') && f21.includes('ancora/raiz-registos-20.ots'), 'a camada 21 sela a 20');
for (const x of FICHEIROS_DA_CAMADA_20_EM_DIANTE) assert.ok(f21.includes(x), `a camada 21 tem de continuar a selar ${x}`);
assert.equal(new Set(f21).size, f21.length, 'caminho repetido na camada 21');
const f22 = ficheirosDaCamada(22);
assert.ok(f22.includes('ancora/raiz-registos-21.json') && f22.includes('ancora/raiz-registos-21.ots'), 'a camada 22 sela a 21');
for (const x of FICHEIROS_DA_CAMADA_20_EM_DIANTE) assert.ok(f22.includes(x), `a camada 22 tem de continuar a selar ${x}`);
assert.equal(new Set(f22).size, f22.length, 'caminho repetido na camada 22');
const f23 = ficheirosDaCamada(23);
assert.ok(f23.includes('ancora/raiz-registos-22.json') && f23.includes('ancora/raiz-registos-22.ots'), 'a camada 23 sela a 22');
for (const x of FICHEIROS_DA_CAMADA_23_EM_DIANTE) { assert.ok(f23.includes(x), `a camada 23 devia selar ${x}`); assert.ok(!f22.includes(x), `a camada 22 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 23 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_20_EM_DIANTE) assert.ok(f23.includes(x), `a camada 23 tem de continuar a selar ${x}`);
assert.equal(new Set(f23).size, f23.length, 'caminho repetido na camada 23');
const f24 = ficheirosDaCamada(24);
assert.ok(f24.includes('ancora/raiz-registos-23.json') && f24.includes('ancora/raiz-registos-23.ots'), 'a camada 24 sela a 23');
for (const x of FICHEIROS_DA_CAMADA_24_EM_DIANTE) { assert.ok(f24.includes(x), `a camada 24 devia selar ${x}`); assert.ok(!f23.includes(x), `a camada 23 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 24 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_23_EM_DIANTE) assert.ok(f24.includes(x), `a camada 24 tem de continuar a selar ${x}`);
assert.equal(new Set(f24).size, f24.length, 'caminho repetido na camada 24');
const f25 = ficheirosDaCamada(25);
assert.ok(f25.includes('ancora/raiz-registos-24.json') && f25.includes('ancora/raiz-registos-24.ots'), 'a camada 25 sela a 24');
for (const x of FICHEIROS_DA_CAMADA_24_EM_DIANTE) assert.ok(f25.includes(x), `a camada 25 tem de continuar a selar ${x}`);
assert.equal(new Set(f25).size, f25.length, 'caminho repetido na camada 25');
const f26 = ficheirosDaCamada(26);
assert.ok(f26.includes('ancora/raiz-registos-25.json') && f26.includes('ancora/raiz-registos-25.ots'), 'a camada 26 sela a 25');
for (const x of FICHEIROS_DA_CAMADA_26_EM_DIANTE) { assert.ok(f26.includes(x), `a camada 26 devia selar ${x}`); assert.ok(!f25.includes(x), `a camada 25 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 26 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_24_EM_DIANTE) assert.ok(f26.includes(x), `a camada 26 tem de continuar a selar ${x}`);
assert.equal(new Set(f26).size, f26.length, 'caminho repetido na camada 26');
const f27 = ficheirosDaCamada(27);
assert.ok(f27.includes('ancora/raiz-registos-26.json') && f27.includes('ancora/raiz-registos-26.ots'), 'a camada 27 sela a 26');
for (const x of FICHEIROS_DA_CAMADA_27_EM_DIANTE) { assert.ok(f27.includes(x), `a camada 27 devia selar ${x}`); assert.ok(!f26.includes(x), `a camada 26 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 27 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_26_EM_DIANTE) assert.ok(f27.includes(x), `a camada 27 tem de continuar a selar ${x}`);
assert.equal(new Set(f27).size, f27.length, 'caminho repetido na camada 27');
const f28 = ficheirosDaCamada(28);
assert.ok(f28.includes('ancora/raiz-registos-27.json') && f28.includes('ancora/raiz-registos-27.ots'), 'a camada 28 sela a 27');
for (const x of FICHEIROS_DA_CAMADA_28_EM_DIANTE) { assert.ok(f28.includes(x), `a camada 28 devia selar ${x}`); assert.ok(!f27.includes(x), `a camada 27 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 28 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_27_EM_DIANTE) assert.ok(f28.includes(x), `a camada 28 tem de continuar a selar ${x}`);
assert.equal(new Set(f28).size, f28.length, 'caminho repetido na camada 28');
const f29 = ficheirosDaCamada(29);
assert.ok(f29.includes('ancora/raiz-registos-28.json') && f29.includes('ancora/raiz-registos-28.ots'), 'a camada 29 sela a 28');
for (const x of FICHEIROS_DA_CAMADA_29_EM_DIANTE) { assert.ok(f29.includes(x), `a camada 29 devia selar ${x}`); assert.ok(!f28.includes(x), `a camada 28 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 29 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_28_EM_DIANTE) assert.ok(f29.includes(x), `a camada 29 tem de continuar a selar ${x}`);
assert.equal(new Set(f29).size, f29.length, 'caminho repetido na camada 29');
const f30 = ficheirosDaCamada(30);
assert.ok(f30.includes('ancora/raiz-registos-29.json') && f30.includes('ancora/raiz-registos-29.ots'), 'a camada 30 sela a 29');
for (const x of FICHEIROS_DA_CAMADA_30_EM_DIANTE) { assert.ok(f30.includes(x), `a camada 30 devia selar ${x}`); assert.ok(!f29.includes(x), `a camada 29 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 30 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_29_EM_DIANTE) assert.ok(f30.includes(x), `a camada 30 tem de continuar a selar ${x}`);
assert.equal(new Set(f30).size, f30.length, 'caminho repetido na camada 30');
const f31 = ficheirosDaCamada(31);
assert.ok(f31.includes('ancora/raiz-registos-30.json') && f31.includes('ancora/raiz-registos-30.ots'), 'a camada 31 sela a 30');
for (const x of FICHEIROS_DA_CAMADA_31_EM_DIANTE) { assert.ok(f31.includes(x), `a camada 31 devia selar ${x}`); assert.ok(!f30.includes(x), `a camada 30 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 31 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_30_EM_DIANTE) assert.ok(f31.includes(x), `a camada 31 tem de continuar a selar ${x}`);
assert.equal(new Set(f31).size, f31.length, 'caminho repetido na camada 31');
const f32 = ficheirosDaCamada(32);
assert.ok(f32.includes('ancora/raiz-registos-31.json') && f32.includes('ancora/raiz-registos-31.ots'), 'a camada 32 sela a 31');
for (const x of FICHEIROS_DA_CAMADA_32_EM_DIANTE) { assert.ok(f32.includes(x), `a camada 32 devia selar ${x}`); assert.ok(!f31.includes(x), `a camada 31 não pode mudar: ${x}`); assert.ok(fs.existsSync(x), `o ficheiro da camada 32 tem de existir: ${x}`); }
for (const x of FICHEIROS_DA_CAMADA_31_EM_DIANTE) assert.ok(f32.includes(x), `a camada 32 tem de continuar a selar ${x}`);
assert.equal(new Set(f32).size, f32.length, 'caminho repetido na camada 32');
const existentes = new Set(['ancora/raiz-registos.json', 'ancora/raiz-registos.ots']);
assert.deepEqual(escolherCaminhos(2, (p) => existentes.has(p)), caminhosDaCamada(2));
assert.throws(() => escolherCaminhos(1, (p) => existentes.has(p)), /já existe/, 'estrago não apanhado: reescrever a camada 1');
assert.throws(() => escolherCaminhos(2, (p) => existentes.has(p) || p === 'ancora/raiz-registos-2.json'), /já existe/, 'estrago não apanhado: reescrever a camada 2');
assert.throws(() => escolherCaminhos(3, (p) => existentes.has(p)), /falta a camada 2/, 'estrago não apanhado: saltar uma camada');
console.log('Regras de camadas conferidas: 3 estragos propositados apanhados.');
