// Leitor autónomo do registo de observações (orum-observacao/v1). Só Node, sem rede, sem a ORA.
//   node kit/observacao.mjs [observacao/observacao.json]
// Confere: formato, sequência, data, estados permitidos, fonte obrigatória para o que se diz verificado,
// a ligação de cada entrada à anterior por sha256 e o próprio sha256. Não confere a verdade do que foi lido:
// confere que o registo é coerente e que ninguém o reescreveu. Quem quiser a verdade relê as fontes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ESTADOS = ['verificado', 'nao_verificado', 'bloqueado'];
const MAX_TEXTO = 400;
const PROMESSA = /receita garantida|reembolso|rendimento|lucro|garant|prometemos|durar[áa] 904|procura provada/i;
const SEGREDO = /eyJ[A-Za-z0-9_-]{20,}|-----BEGIN|\b0x[0-9a-fA-F]{64}\b|sk_[A-Za-z0-9]{16,}/;

const ordenar = (v) => Array.isArray(v) ? v.map(ordenar) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])])) : v;
export const canonico = (o) => JSON.stringify(ordenar(o));
export const hashDe = (entrada) => { const { hash, ...resto } = entrada; return crypto.createHash('sha256').update(canonico(resto), 'utf8').digest('hex'); };

export function validar(doc) {
  const e = [];
  if (doc?.format !== 'orum-observacao/v1') e.push('format inesperado');
  if (!Array.isArray(doc?.entradas) || doc.entradas.length === 0) return [...e, 'sem entradas'];
  if (!/n[ãa]o promete/i.test(doc.fronteira ?? '')) e.push('falta a fronteira "não promete"');
  let anterior = null, dataAnt = '';
  doc.entradas.forEach((x, i) => {
    const r = `entrada ${i + 1}`;
    if (x.n !== i + 1) e.push(`${r}: n fora de sequência`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.data ?? '')) e.push(`${r}: data inválida`);
    else if (x.data < dataAnt) e.push(`${r}: data anterior à da entrada anterior`); else dataAnt = x.data;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(x.lido_em_utc ?? '') || !(x.lido_em_utc ?? '').startsWith(x.data ?? '?')) e.push(`${r}: lido_em_utc inválido ou de outro dia`);
    if (typeof x.agente !== 'string' || x.agente.trim().length < 3) e.push(`${r}: falta o agente`);
    if (!Array.isArray(x.afirmacoes) || x.afirmacoes.length === 0) e.push(`${r}: sem afirmações`);
    (x.afirmacoes ?? []).forEach((a, j) => {
      const s = `${r}, afirmação ${j + 1}`;
      if (!ESTADOS.includes(a.estado)) e.push(`${s}: estado fora de ${ESTADOS.join('/')}`);
      if (typeof a.texto !== 'string' || a.texto.trim().length < 3) e.push(`${s}: falta o texto`);
      else {
        if (a.texto.length > MAX_TEXTO) e.push(`${s}: texto com mais de ${MAX_TEXTO} caracteres`);
        if (PROMESSA.test(a.texto)) e.push(`${s}: promete o que não pode`);
        if (SEGREDO.test(a.texto)) e.push(`${s}: parece conter um segredo`);
      }
      const fonte = typeof a.fonte === 'string' ? a.fonte.trim() : '';
      if (a.estado === 'verificado' && fonte.length < 3) e.push(`${s}: dada por verificada sem fonte`);
      if (a.estado === 'bloqueado' && !(typeof a.motivo === 'string' && a.motivo.trim().length >= 3)) e.push(`${s}: bloqueada sem motivo`);
    });
    if (x.anterior !== anterior) e.push(`${r}: a ligação à entrada anterior não bate`);
    if (x.hash !== hashDe(x)) e.push(`${r}: o hash não bate com o conteúdo`);
    anterior = x.hash;
  });
  return e;
}

export function resumo(doc) {
  const c = { verificado: 0, nao_verificado: 0, bloqueado: 0 };
  for (const x of doc.entradas) for (const a of x.afirmacoes) c[a.estado] = (c[a.estado] ?? 0) + 1;
  return { entradas: doc.entradas.length, ...c, ultimo_hash: doc.entradas.at(-1).hash };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const caminho = process.argv[2] ?? 'observacao/observacao.json';
  const doc = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  const erros = validar(doc);
  if (erros.length) { console.error(`FALHA (${caminho}):\n- ${erros.join('\n- ')}`); process.exit(1); }
  console.log(`OK ${caminho}: ${JSON.stringify(resumo(doc))}`);
}
