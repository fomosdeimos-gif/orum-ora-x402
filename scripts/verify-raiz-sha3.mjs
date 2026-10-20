// Verifica o segundo hash da raiz dos registos (ancora/raiz-sha3.json): o real tem de passar contra os commits das camadas
// e cada mentira propositada tem de falhar. Sem rede, sem pagamentos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { verificarSha3, manifestosDeCamadas } from '../kit/raiz.mjs';
import { sha256, sha3_256, raiz, raizSha3, textoCanonicoCom, entradaSha3DeCamada } from './lib/raiz.mjs';

// 1. Respostas conhecidas do SHA3-256 (FIPS 202): apanham quem troque o algoritmo por outro
assert.equal(sha3_256(Buffer.from('')), 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');
assert.equal(sha3_256(Buffer.from('abc')), '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532');
assert.notEqual(sha3_256(Buffer.from('abc')), sha256(Buffer.from('abc')));
let mentiras = 3;

// 2. O complemento real, contra os commits reais
const gitLer = (commit, p) => execFileSync('git', ['show', `${commit}:${p}`], { maxBuffer: 64 * 1024 * 1024 });
const manifestosReais = Object.fromEntries(manifestosDeCamadas('.').map((p) => [p, fs.readFileSync(p)]));
const realBytes = fs.readFileSync('ancora/raiz-sha3.json');
const real = verificarSha3({ complementoBytes: realBytes, manifestos: manifestosReais, ler: gitLer });
assert.ok(real.camadas.length >= 1);
const ids = new Set(JSON.parse(realBytes).camadas.map((k) => k.camada));
assert.ok(ids.has(1), 'o complemento tem de cobrir a camada 1');

// 3. Fixture em memória: duas camadas pequenas, sem git
const ficheiros = { 'a.txt': Buffer.from('um'), 'b/c.txt': Buffer.from('dois'), 'd.txt': Buffer.from('três') };
const lerMem = (commit, p) => { if (!(p in ficheiros)) throw new Error('em falta'); return ficheiros[p]; };
const montar = (camada, nomes) => {
  const lista = nomes.map((caminho) => ({ caminho, sha256: sha256(ficheiros[caminho]) }));
  return { schema: 'orum-raiz/v1', camada, commit_base: 'c'.repeat(40), ficheiros: lista, raiz_sha256: raiz(lista) };
};
const m1 = montar(1, ['a.txt', 'b/c.txt']);
const m2 = montar(2, ['a.txt', 'b/c.txt', 'd.txt']);
const manifestos = { 'ancora/raiz-registos.json': Buffer.from(JSON.stringify(m1)), 'ancora/raiz-registos-2.json': Buffer.from(JSON.stringify(m2)) };
const complemento = {
  schema: 'orum-raiz-sha3/v1',
  prova: 'Regista hashes. Não prova autoria, valor, procura nem receita.',
  camadas: [entradaSha3DeCamada('ancora/raiz-registos.json', m1, lerMem), entradaSha3DeCamada('ancora/raiz-registos-2.json', m2, lerMem)],
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const corre = (c = complemento, ms = manifestos, ler = lerMem) => verificarSha3({ complementoBytes: Buffer.from(JSON.stringify(c)), manifestos: ms, ler });
const falha = (nome, fn) => { assert.throws(fn, undefined, `estrago não apanhado: ${nome}`); mentiras++; };
const com = (mut) => { const c = clone(complemento); mut(c); return c; };

assert.equal(corre().camadas.length, 2, 'o caso completo devia passar');
assert.equal(corre().camadas[1].ficheiros, 3);
assert.match(corre().camadas[0].texto_sha3, /^a\.txt\t[0-9a-f]{64}\nb\/c\.txt\t[0-9a-f]{64}\n$/);

falha('ficheiro alterado no commit', () => corre(complemento, manifestos, (c, p) => (p === 'a.txt' ? Buffer.from('mentira') : lerMem(c, p))));
falha('ficheiro em falta no commit', () => corre(complemento, manifestos, (c, p) => { if (p === 'd.txt') throw new Error('em falta'); return lerMem(c, p); }));
falha('sha3 de um ficheiro mudado', () => corre(com((c) => { c.camadas[0].ficheiros[0].sha3_256 = '0'.repeat(64); })));
falha('sha256 de um ficheiro mudado', () => corre(com((c) => { c.camadas[0].ficheiros[0].sha256 = '0'.repeat(64); })));
falha('raiz sha3 mudada', () => corre(com((c) => { c.camadas[1].raiz_sha3_256 = '1'.repeat(64); })));
falha('raiz sha256 mudada', () => corre(com((c) => { c.camadas[1].raiz_sha256 = '1'.repeat(64); })));
falha('ficheiro retirado da lista', () => corre(com((c) => { c.camadas[1].ficheiros.pop(); })));
falha('ficheiro acrescentado fora do manifesto', () => corre(com((c) => { c.camadas[0].ficheiros.push({ caminho: 'd.txt', sha256: sha256(ficheiros['d.txt']), sha3_256: sha3_256(ficheiros['d.txt']) }); })));
falha('campo sha3 com o valor do sha256 (não é SHA3)', () => corre(com((c) => { for (const f of c.camadas[0].ficheiros) f.sha3_256 = f.sha256; c.camadas[0].raiz_sha3_256 = raizSha3(c.camadas[0].ficheiros.map((f) => ({ ...f, sha3_256: f.sha256 }))); })));
// complemento forjado mas coerente consigo próprio: sha3 falso num ficheiro E a raiz sha3 recalculada a condizer
falha('sha3 falso com a raiz sha3 recalculada (só os bytes o denunciam)', () => corre(com((c) => {
  c.camadas[0].ficheiros[0].sha3_256 = 'f'.repeat(64);
  c.camadas[0].raiz_sha3_256 = raizSha3(c.camadas[0].ficheiros);
})));
// ficheiro forjado E o seu sha3 forjado a condizer: só o sha256 dito pelo manifesto (a raiz ancorada) o denuncia
falha('ficheiro e sha3 forjados juntos (só o sha256 o denuncia)', () => corre(com((c) => {
  c.camadas = [c.camadas[0]]; // só a camada 1, para nenhuma outra a denunciar
  c.camadas[0].ficheiros[0].sha3_256 = sha3_256(Buffer.from('forjado'));
  c.camadas[0].raiz_sha3_256 = raizSha3(c.camadas[0].ficheiros);
}), manifestos, (cm, p) => (p === 'a.txt' ? Buffer.from('forjado') : lerMem(cm, p))));
// ficheiro retirado com a raiz sha3 recalculada: só a raiz sha256 contra a lista o denuncia
falha('ficheiro retirado com a raiz sha3 recalculada', () => corre(com((c) => {
  c.camadas[1].ficheiros.pop();
  c.camadas[1].raiz_sha3_256 = raizSha3(c.camadas[1].ficheiros);
})));
falha('sem a fronteira "não prova"', () => corre(com((c) => { c.prova = 'Prova valor.'; })));
falha('schema desconhecido', () => corre(com((c) => { c.schema = 'outro'; })));
falha('commit diferente do manifesto', () => corre(com((c) => { c.camadas[0].commit_base = 'd'.repeat(40); })));
falha('camada repetida', () => corre(com((c) => { c.camadas[1].camada = 1; })));
falha('manifesto em falta', () => corre(complemento, { 'ancora/raiz-registos.json': manifestos['ancora/raiz-registos.json'] }));
falha('manifesto com outra raiz', () => corre(complemento, { ...manifestos, 'ancora/raiz-registos.json': Buffer.from(JSON.stringify({ ...m1, raiz_sha256: '2'.repeat(64) })) }));
falha('manifesto com outro hash de ficheiro', () => corre(complemento, { ...manifestos, 'ancora/raiz-registos.json': Buffer.from(JSON.stringify({ ...m1, ficheiros: [{ ...m1.ficheiros[0], sha256: '3'.repeat(64) }, m1.ficheiros[1]] })) }));
falha('sem camadas', () => corre(com((c) => { c.camadas = []; })));
falha('hash com tamanho errado', () => textoCanonicoCom([{ caminho: 'a', sha3_256: 'abc' }], 'sha3_256'));
falha('campo de hash desconhecido', () => textoCanonicoCom([{ caminho: 'a', md5: 'x' }], 'md5'));
falha('caminho com ..', () => textoCanonicoCom([{ caminho: '../x', sha3_256: '0'.repeat(64) }], 'sha3_256'));

console.log(JSON.stringify({ verified: true, camadas_reais: real.camadas.map((k) => ({ camada: k.camada, ficheiros: k.ficheiros, raiz_sha3_256: k.raiz_sha3_256 })), casos_de_mentira: mentiras }));
