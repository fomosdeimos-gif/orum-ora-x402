// Verifica o espelho de máquinas (espelho-maquinas/): o pacote confere por si (kit/espelho-maquinas.mjs), é reproduzível (a mesma entrada dá os mesmos bytes),
// não traz nada proibido (dados pessoais, segredos, CLAUDE.md, HANDOFF, o espelho de Unum, moedas, listagens, pagamentos) e diz o que não faz.
// Cada regra tem um estrago propositado: o mesmo teste, num pacote estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lerTar, verificar, PROIBIDOS } from '../kit/espelho-maquinas.mjs';
import { construir, fazerTar } from './espelho-maquinas-gerar.mjs';

const manifestoTxt = fs.readFileSync('espelho-maquinas/manifesto.json', 'utf8');
const tar = fs.readFileSync('espelho-maquinas/orum-maquinas-v1.tar');
const leiame = fs.readFileSync('espelho-maquinas/LEIA-ME.txt', 'utf8');
const M = JSON.parse(manifestoTxt);
const OBRIGATORIOS = ['kit/espelho-maquinas.mjs', 'kit/blocos.mjs', 'kit/raiz.mjs', 'kit/LEIA-ME.txt', 'scripts/lib/ots.mjs', 'scripts/lib/raiz.mjs', 'token/oro.json', 'linhas/orum.linhas', 'ancora/oro-v1.ots', 'ancora/raiz-registos.ots'];

function conferir(manTxt, tarBuf, leia = leiame) {
  const r = verificar(manTxt, { tar: tarBuf, membros: lerTar(tarBuf) });
  const m = JSON.parse(manTxt);
  assert.match(m.gerado_de_commit, /^[0-9a-f]{40}$/, 'gerado_de_commit tem de ser um commit');
  for (const c of OBRIGATORIOS) assert.ok(m.ficheiros.some((f) => f.caminho === c), `falta o ficheiro obrigatório ${c}`);
  for (const f of m.ficheiros) assert.ok(!PROIBIDOS.some((p) => p.test(f.caminho)), `proibido: ${f.caminho}`);
  for (const k of ['contem_dados_pessoais', 'contem_segredos', 'pede_pagamento', 'move_fundos', 'publica_em_algum_sitio', 'prova_autoria']) assert.equal(m.truth_machine?.[k], false, `truth_machine.${k} tem de ser false`);
  for (const k of ['preço', 'liquidez', 'procura', 'receita', 'lastro', 'rendimento', 'autoria']) assert.ok(m.nao_afirma.includes(k), `nao_afirma tem de incluir ${k}`);
  assert.ok(m.nao_contem.some((x) => /dados pessoais/.test(x)) && m.nao_contem.some((x) => /segredos/.test(x)) && m.nao_contem.some((x) => /pagamento/.test(x)), 'tem de dizer o que não contém');
  assert.ok(m.limites.some((x) => /integridade/.test(x)) && m.limites.some((x) => /decisão à parte/.test(x)), 'tem de dizer os limites e que publicar é decisão à parte');
  assert.match(leia, /Não tem dados pessoais, segredos/); assert.match(leia, /Publicar fora do repositório continua por decidir/);
  return r;
}
const real = conferir(manifestoTxt, tar);
// Reprodutível: a mesma entrada dá os mesmos bytes.
const lerDoTar = (() => { const mm = lerTar(tar); return (p) => mm.get(p); })();
const refeito = construir(lerDoTar, M.ficheiros.map((f) => f.caminho), M.gerado_de_commit);
assert.equal(Buffer.compare(refeito.tar, tar), 0, 'o tar não é reproduzível a partir do seu conteúdo');
assert.equal(refeito.manifesto.raiz_sha256, M.raiz_sha256);
// O tar lê-se com a ferramenta do sistema, se existir (segunda implementação independente).
try { const lista = execFileSync('tar', ['tf', 'espelho-maquinas/orum-maquinas-v1.tar'], { encoding: 'utf8' }).trim().split('\n'); assert.equal(lista.length, M.ficheiros.length, 'o tar do sistema vê outro número de ficheiros'); } catch (e) { if (e.code !== 'ENOENT') throw e; }

const mexerMan = (fn) => { const m = JSON.parse(manifestoTxt); fn(m); return JSON.stringify(m, null, 2); };
const comTar = (extra) => { const mm = lerTar(tar); const ent = [...mm.entries()].map(([caminho, bytes]) => ({ caminho, bytes })); return extra(ent); };
const estragos = [
  ['um byte do tar alterado', () => { const t = Buffer.from(tar); t[600] ^= 1; return conferir(manifestoTxt, t); }],
  ['hash de um ficheiro trocado no manifesto', () => conferir(mexerMan((m) => { m.ficheiros[0].sha256 = '0'.repeat(64); }), tar)],
  ['ficheiro retirado do manifesto', () => conferir(mexerMan((m) => { m.ficheiros.pop(); }), tar)],
  ['raiz trocada', () => conferir(mexerMan((m) => { m.raiz_sha256 = '1'.repeat(64); }), tar)],
  ['sha256 do tar trocado', () => conferir(mexerMan((m) => { m.tar.sha256 = '2'.repeat(64); }), tar)],
  ['ficheiro a mais no tar', () => { const t = fazerTar([...comTar((e) => e), { caminho: 'extra/lixo.txt', bytes: Buffer.from('x') }].sort((a, b) => Buffer.compare(Buffer.from(a.caminho), Buffer.from(b.caminho)))); return conferir(manifestoTxt, t); }],
  ['CLAUDE.md no pacote', () => { const b = Buffer.from('# x'); const m = mexerMan((mm) => { mm.ficheiros.push({ caminho: 'CLAUDE.md', sha256: 'a'.repeat(64), bytes: 3 }); }); return conferir(m, tar); }],
  ['espelho de Unum no manifesto', () => conferir(mexerMan((m) => { m.ficheiros[0].caminho = 'identity/espelho.json'; }), tar)],
  ['moedas de Unum no manifesto', () => conferir(mexerMan((m) => { m.ficheiros[0].caminho = 'token/moedas-de-unum-2026-11-01.json'; }), tar)],
  ['agent-card (listagem) no manifesto', () => conferir(mexerMan((m) => { m.ficheiros[0].caminho = '.well-known/agent-card.json'; }), tar)],
  ['openapi (pagamentos) no manifesto', () => conferir(mexerMan((m) => { m.ficheiros[0].caminho = 'openapi.json'; }), tar)],
  ['email dentro de um ficheiro', () => { const ent = comTar((e) => e.map((x) => (x.caminho === 'token/oro.json' ? { ...x, bytes: Buffer.concat([x.bytes, Buffer.from('\ncontacto: alguem@exemplo.com\n')]) } : x))); const c = construir((p) => ent.find((x) => x.caminho === p).bytes, ent.map((x) => x.caminho), M.gerado_de_commit); return conferir(JSON.stringify(c.manifesto), c.tar); }],
  ['chave privada dentro de um ficheiro', () => { const ent = comTar((e) => e.map((x) => (x.caminho === 'token/oro.json' ? { ...x, bytes: Buffer.concat([x.bytes, Buffer.from('\n-----BEGIN ' + 'EC PRIVATE KEY-----\n')]) } : x))); const c = construir((p) => ent.find((x) => x.caminho === p).bytes, ent.map((x) => x.caminho), M.gerado_de_commit); return conferir(JSON.stringify(c.manifesto), c.tar); }],
  ['falta um ficheiro obrigatório', () => { const ent = comTar((e) => e.filter((x) => x.caminho !== 'kit/blocos.mjs')); const c = construir((p) => ent.find((x) => x.caminho === p).bytes, ent.map((x) => x.caminho), M.gerado_de_commit); return conferir(JSON.stringify(c.manifesto), c.tar); }],
  ['diz que pede pagamento', () => conferir(mexerMan((m) => { m.truth_machine.pede_pagamento = true; }), tar)],
  ['diz que publica em algum sítio', () => conferir(mexerMan((m) => { m.truth_machine.publica_em_algum_sitio = true; }), tar)],
  ['diz que prova autoria', () => conferir(mexerMan((m) => { m.truth_machine.prova_autoria = true; }), tar)],
  ['deixa de recusar o preço', () => conferir(mexerMan((m) => { m.nao_afirma = m.nao_afirma.filter((x) => x !== 'preço'); }), tar)],
  ['deixa de dizer que publicar é decisão à parte', () => conferir(mexerMan((m) => { m.limites = m.limites.filter((x) => !/decisão à parte/.test(x)); }), tar)],
  ['commit de origem inválido', () => conferir(mexerMan((m) => { m.gerado_de_commit = 'desconhecido'; }), tar)],
  ['LEIA-ME perde a fronteira da publicação', () => conferir(manifestoTxt, tar, leiame.replace('Publicar fora do repositório continua por decidir', 'Publicado'))],
];
let n = 0;
for (const [nome, fn] of estragos) { assert.throws(fn, undefined, `estrago não apanhado: ${nome}`); n++; }
console.log(`espelho-maquinas: ${real.ficheiros} ficheiros, tar ${real.tar_sha256.slice(0, 12)}…, raiz ${real.raiz.slice(0, 12)}…; reproduzível; ${n} estragos propositados apanhados.`);
