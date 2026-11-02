// Verifica oruming/oruming.json: escrita a duas vozes, só se acrescenta. Cada entrada traz a palavra de Unum em citação literal
// (que tem de existir na cláusula indicada do CLAUDE.md) e uma linha da ORA; cada entrada liga-se à anterior por sha256.
// Sem rede. Cada mentira testada aqui tem de falhar.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CAMINHO = 'oruming/oruming.json';
const MAX_LINHA = 280;
const PROMESSA = /receita garantida|reembolso|rendimento|lucro|garant|prometemos|durar[áa] 904|904 anos garantidos|procura provada/i;
const SEGREDO = /eyJ[A-Za-z0-9_-]{20,}|-----BEGIN|\b0x[0-9a-fA-F]{64}\b|sk_[A-Za-z0-9]{16,}/;

const ordenar = (v) => Array.isArray(v) ? v.map(ordenar) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])])) : v;
export const canonico = (o) => JSON.stringify(ordenar(o));
export const hashDe = (entrada) => { const { hash, ...resto } = entrada; return crypto.createHash('sha256').update(canonico(resto), 'utf8').digest('hex'); };

function clausula(claude, titulo) {
  const i = claude.indexOf(titulo);
  if (i < 0) return null;
  const resto = claude.slice(i + titulo.length);
  const fim = resto.search(/\n## /);
  return fim < 0 ? resto : resto.slice(0, fim);
}

export function validar(doc, claude) {
  const e = [];
  if (doc.format !== 'orum-oruming/v1') e.push('format inesperado');
  if (!Array.isArray(doc.entradas) || doc.entradas.length === 0) return [...e, 'sem entradas'];
  if (!/n[ãa]o promete/i.test(doc.fronteira ?? '')) e.push('falta a fronteira "não promete"');
  let anterior = null, dataAnt = '';
  doc.entradas.forEach((x, i) => {
    const r = `entrada ${i + 1}`;
    if (x.n !== i + 1) e.push(`${r}: n fora de sequência`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.data ?? '')) e.push(`${r}: data inválida`); else if (x.data < dataAnt) e.push(`${r}: data anterior à da entrada anterior`); else dataAnt = x.data;
    const o = x.observador ?? {};
    if (!o.citacao || !o.clausula) e.push(`${r}: falta a citação ou a cláusula do observador`);
    else {
      const corpo = clausula(claude, o.clausula);
      if (corpo === null) e.push(`${r}: a cláusula não existe: ${o.clausula}`);
      else if (!corpo.includes(o.citacao)) e.push(`${r}: a citação não existe palavra por palavra na cláusula ${o.clausula}`);
    }
    const l = x.ora?.linha;
    if (typeof l !== 'string' || l.trim().length < 3) e.push(`${r}: falta a linha da ORA`);
    else {
      if (l.length > MAX_LINHA) e.push(`${r}: linha da ORA com mais de ${MAX_LINHA} caracteres`);
      if (PROMESSA.test(l)) e.push(`${r}: a linha da ORA promete o que não pode`);
      if (SEGREDO.test(l)) e.push(`${r}: a linha da ORA parece conter um segredo`);
    }
    if (x.anterior !== anterior) e.push(`${r}: a ligação à entrada anterior não bate`);
    if (x.hash !== hashDe(x)) e.push(`${r}: o hash não bate com o conteúdo`);
    anterior = x.hash;
  });
  return e;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const doc = JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));
  const claude = fs.readFileSync('CLAUDE.md', 'utf8');
  const real = validar(doc, claude);
  assert.deepEqual(real, [], `o oruming real tem de passar: ${JSON.stringify(real)}`);

  const clone = () => JSON.parse(JSON.stringify(doc));
  const refaz = (d) => { let ant = null; d.entradas.forEach((x) => { x.anterior = ant; x.hash = hashDe(x); ant = x.hash; }); return d; };
  let n = 0;
  const falha = (nome, d, trecho, cl = claude) => {
    const r = validar(d, cl);
    assert.ok(r.some((x) => x.includes(trecho)), `estrago não apanhado (${nome}): ${JSON.stringify(r)}`);
    n++;
  };
  let d = clone(); d.format = 'x'; falha('format', d, 'format');
  d = clone(); d.entradas = []; falha('sem entradas', d, 'sem entradas');
  d = clone(); d.fronteira = 'Tudo.'; falha('sem fronteira', d, 'fronteira');
  d = clone(); d.entradas[0].ora.linha = 'Outra linha, escrita depois.'; falha('entrada reescrita (hash antigo)', d, 'hash não bate');
  d = clone(); d.entradas[0].anterior = 'x'.repeat(64); falha('ligação à anterior quebrada', d, 'ligação');
  d = clone(); d.entradas[0].n = 3; falha('n fora de sequência', d, 'n fora de sequência');
  d = clone(); d.entradas[0].data = '2026-13-99x'; falha('data inválida', d, 'data inválida');
  d = clone(); d.entradas[0].observador.citacao = 'Isto o Unum nunca escreveu'; d = refaz(d); falha('citação inventada', d, 'palavra por palavra');
  d = clone(); d.entradas[0].observador.clausula = '## Cláusula que não existe'; d = refaz(d); falha('cláusula inexistente', d, 'cláusula não existe');
  d = clone(); delete d.entradas[0].observador.citacao; d = refaz(d); falha('sem citação', d, 'falta a citação');
  d = clone(); d.entradas[0].ora.linha = ''; d = refaz(d); falha('sem linha da ORA', d, 'falta a linha');
  d = clone(); d.entradas[0].ora.linha = 'a'.repeat(MAX_LINHA + 1); d = refaz(d); falha('linha longa demais', d, 'mais de');
  d = clone(); d.entradas[0].ora.linha = 'Receita garantida para quem escrever connosco.'; d = refaz(d); falha('promessa', d, 'promete');
  d = clone(); d.entradas[0].ora.linha = 'chave 0x' + 'a'.repeat(64); d = refaz(d); falha('segredo', d, 'segredo');
  d = clone(); d.entradas.push({ ...clone().entradas[0], n: 2, data: '2026-11-01' }); d = refaz(d); falha('data para trás', d, 'data anterior');
  falha('cláusula apagada do CLAUDE.md', clone(), 'cláusula não existe', claude.replace('## Oruming (Unum, 2/11/2026)', '## Outra coisa'));
  console.log(`Oruming: ${doc.entradas.length} entrada(s) conferida(s), encadeadas por sha256; ${n} estragos propositados apanhados.`);
}
