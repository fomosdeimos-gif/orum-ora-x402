import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { verificarRaiz } from '../kit/raiz.mjs';
import { lerRecibo } from './lib/ots.mjs';

const manifestoBytes = fs.readFileSync('ancora/raiz-registos.json');
const manifesto = JSON.parse(manifestoBytes);
const reciboBytes = fs.readFileSync(manifesto.recibo);
const ler = (p) => execFileSync('git', ['show', `${manifesto.commit_base}:${p}`], { maxBuffer: 64 * 1024 * 1024 });

const ok = verificarRaiz({ ler, manifestoBytes, reciboBytes });
assert.match(ok.estado, /^(pendente|confirmado no bloco)/);
assert.equal(lerRecibo(reciboBytes).digest, manifesto.raiz_sha256);
console.log(`Raiz ${ok.raiz.slice(0, 12)}… (${ok.estado}) de ${ok.ficheiros} ficheiros do commit ${manifesto.commit_base.slice(0, 7)}`);

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
console.log(`Estragos propositados apanhados: ${/^confirmado/.test(ok.estado) ? 11 : 10}.`);
