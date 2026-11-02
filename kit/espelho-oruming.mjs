// Oruming sobre o espelho: escrita a duas vozes, só se acrescenta. Sem pacotes, sem rede; qualquer máquina refaz as contagens sem a ORA.
// A voz da ORA conta (padrões que se conferem nas citações literais de Unum, em identity/espelho.json) e pergunta; nunca diz quem Unum é.
// A voz de Unum entra só como citação literal que existe numa cláusula do CLAUDE.md. Uso: node kit/espelho-oruming.mjs [pasta-do-repositório]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_LINHA = 280;
const PROMESSA = /receita garantida|reembols|rendimento|lucro|garant|prometemos|procura provada/i;
const DIAGNOSTICO = /\b(?:tu és|és um|és uma|sofres|estás (?:triste|deprimid|ansios)|depress|ansiedade|doença|diagnóst|perturba|trauma|personalidade)\b/i;
const SEGREDO = /eyJ[A-Za-z0-9_-]{20,}|-----BEGIN|\b0x[0-9a-fA-F]{64}\b|sk_[A-Za-z0-9]{16,}/;

const ordenar = (v) => Array.isArray(v) ? v.map(ordenar) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])])) : v;
export const canonico = (o) => JSON.stringify(ordenar(o));
export const hashDe = (entrada) => { const { hash, ...resto } = entrada; return crypto.createHash('sha256').update(canonico(resto), 'utf8').digest('hex'); };

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Conta o termo (palavra ou expressão) nas citações com id <= ateId, uma citação de cada vez, em minúsculas, com fronteira de palavra.
export function contar(espelho, termo, ateId) {
  const re = new RegExp(`(?<![\\p{L}])${esc(termo.toLowerCase())}(?![\\p{L}])`, 'gu');
  let ocorrencias = 0; const ids = [];
  for (const c of espelho.citacoes) {
    if (c.id > ateId) continue;
    const n = (c.citacao.toLowerCase().match(re) ?? []).length;
    if (n > 0) { ocorrencias += n; ids.push(c.id); }
  }
  return { ocorrencias, citacoes_ids: ids };
}

function clausula(claude, titulo) {
  const i = claude.indexOf(titulo);
  if (i < 0) return null;
  const resto = claude.slice(i + titulo.length);
  const fim = resto.search(/\n## /);
  return fim < 0 ? resto : resto.slice(0, fim);
}

export function validar(doc, espelho, claude) {
  const e = [];
  if (doc.format !== 'orum-espelho-oruming/v1') e.push('format inesperado');
  if (!Array.isArray(doc.entradas) || doc.entradas.length === 0) return [...e, 'sem entradas'];
  if (!/n[ãa]o (?:diz|diagnostica)/i.test(doc.fronteira ?? '') || !/n[ãa]o promete/i.test(doc.fronteira ?? '')) e.push('falta a fronteira (não diz quem Unum é; não promete)');
  let anterior = null, dataAnt = '';
  const perguntas = new Map();
  doc.entradas.forEach((x, i) => {
    const r = `entrada ${i + 1}`;
    if (x.n !== i + 1) e.push(`${r}: n fora de sequência`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.data ?? '')) e.push(`${r}: data inválida`); else if (x.data < dataAnt) e.push(`${r}: data anterior à da entrada anterior`); else dataAnt = x.data;
    if (x.tipo === 'pergunta') {
      const p = x.padrao ?? {};
      if (!p.termo || !Number.isInteger(p.ate_citacao_id)) e.push(`${r}: padrão sem termo ou ate_citacao_id`);
      else {
        const c = contar(espelho, p.termo, p.ate_citacao_id);
        if (c.ocorrencias !== p.ocorrencias) e.push(`${r}: a contagem de "${p.termo}" não bate (${p.ocorrencias} ≠ ${c.ocorrencias})`);
        if (JSON.stringify(c.citacoes_ids) !== JSON.stringify(p.citacoes_ids)) e.push(`${r}: as citações onde "${p.termo}" aparece não batem`);
      }
      const q = x.ora?.pergunta;
      if (typeof q !== 'string' || q.trim().length < 5) e.push(`${r}: falta a pergunta da ORA`);
      else {
        if (!q.trim().endsWith('?')) e.push(`${r}: a voz da ORA pergunta, e a pergunta tem de acabar em ?`);
        if (q.length > MAX_LINHA) e.push(`${r}: pergunta com mais de ${MAX_LINHA} caracteres`);
        if (PROMESSA.test(q)) e.push(`${r}: a pergunta promete o que não pode`);
        if (DIAGNOSTICO.test(q)) e.push(`${r}: a pergunta diz quem Unum é ou como está; a ORA não sabe`);
        if (SEGREDO.test(q)) e.push(`${r}: a pergunta parece conter um segredo`);
      }
      perguntas.set(x.n, x);
    } else if (x.tipo === 'resposta') {
      if (!perguntas.has(x.responde_a)) e.push(`${r}: responde a uma pergunta que não existe antes`);
      const o = x.observador ?? {};
      if (!o.citacao || !o.clausula) e.push(`${r}: falta a citação ou a cláusula de Unum`);
      else {
        const corpo = clausula(claude, o.clausula);
        if (corpo === null) e.push(`${r}: a cláusula não existe: ${o.clausula}`);
        else if (!corpo.includes(o.citacao)) e.push(`${r}: a citação não existe palavra por palavra na cláusula ${o.clausula}`);
      }
    } else if (x.tipo === 'palavra') {
      // palavra de Unum que não responde a uma pergunta: citação literal + leitura da ORA, marcada como leitura
      const o = x.observador ?? {};
      if (!o.citacao || !o.clausula) e.push(`${r}: falta a citação ou a cláusula de Unum`);
      else {
        const corpo = clausula(claude, o.clausula);
        if (corpo === null) e.push(`${r}: a cláusula não existe: ${o.clausula}`);
        else if (!corpo.includes(o.citacao)) e.push(`${r}: a citação não existe palavra por palavra na cláusula ${o.clausula}`);
      }
      const l = x.ora?.leitura;
      if (typeof l !== 'string' || !l.startsWith('Leitura da ORA:')) e.push(`${r}: a leitura da ORA tem de começar por "Leitura da ORA:" (é leitura, não palavra de Unum)`);
      else {
        if (l.length > MAX_LINHA) e.push(`${r}: leitura com mais de ${MAX_LINHA} caracteres`);
        if (PROMESSA.test(l)) e.push(`${r}: a leitura promete o que não pode`);
        if (DIAGNOSTICO.test(l)) e.push(`${r}: a leitura diz quem Unum é ou como está; a ORA não sabe`);
        if (SEGREDO.test(l)) e.push(`${r}: a leitura parece conter um segredo`);
      }
    } else e.push(`${r}: tipo desconhecido`);
    if (x.anterior !== anterior) e.push(`${r}: a ligação à entrada anterior não bate`);
    if (x.hash !== hashDe(x)) e.push(`${r}: o hash não bate com o conteúdo`);
    anterior = x.hash;
  });
  return e;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? '.';
  const lerJ = (p) => JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8'));
  const erros = validar(lerJ('identity/espelho-oruming.json'), lerJ('identity/espelho.json'), fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'));
  if (erros.length) { console.error('FALHA: ' + erros.join('; ')); process.exit(1); }
  console.log('OK: o oruming do espelho confere (contagens refeitas, citações literais, entradas encadeadas).');
}
