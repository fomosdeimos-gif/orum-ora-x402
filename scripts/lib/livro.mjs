// Cópia do livro ora_mudancas no repositório (livro 1066 e seguinte, 26/10/2026): formato e regras, partilhados pelo
// exportador e pelo verificador. A cópia é um ficheiro de linhas JSON, só de acrescentar, com hash encadeado.
// A fonte continua a ser a tabela na base; isto é cópia. Sem rede, sem segredos.
import { createHash } from 'node:crypto';

export const ZERO = '0'.repeat(64);
export const CAMINHO = 'livro/ora_mudancas.jsonl';
const PARECE_SEGREDO = /-----BEGIN|\bsk_[A-Za-z0-9]{16,}|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.|service_role/i;

export function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
export const sha256 = (t) => createHash('sha256').update(t).digest('hex');
export const selo = (prev, corpo) => sha256(`${prev}\n${canonico(corpo)}`);

// Um instantâneo da linha no livro, encadeado ao anterior.
export function novaLinha(prev, n, copiadoEm, linha) {
  const corpo = { n, id: linha.id, copiado_em: copiadoEm, copia: true, linha };
  return { ...corpo, prev, sha256: selo(prev, corpo) };
}

export function ler(texto) {
  return texto.split('\n').filter((l) => l.trim() !== '').map((l, i) => {
    try { return JSON.parse(l); } catch { return { _erro: `linha ${i + 1}: JSON inválido` }; }
  });
}

// Acrescenta as linhas da base que são novas ou mudaram face ao último instantâneo do mesmo id. Devolve as novas linhas.
export function acrescentar(existentes, base, copiadoEm) {
  const ultimo = new Map();
  for (const l of existentes) ultimo.set(l.id, canonico(l.linha));
  let prev = existentes.at(-1)?.sha256 ?? ZERO;
  let n = (existentes.at(-1)?.n ?? 0) + 1;
  const novas = [];
  for (const linha of [...base].sort((a, b) => Number(a.id) - Number(b.id))) {
    if (ultimo.get(linha.id) === canonico(linha)) continue;
    const nova = novaLinha(prev, n++, copiadoEm, linha);
    novas.push(nova);
    prev = nova.sha256;
  }
  return novas;
}

// Erros da cópia. Com `base` (linhas lidas da tabela) cruza-a: uma linha na cópia que a base não tem é erro; o que a base
// tem de novo ou de diferente não é erro, fica em `porActualizar`.
export function validar(texto, base = null) {
  const e = [];
  const linhas = ler(texto);
  let prev = ZERO;
  let n = 0;
  const ultimo = new Map();
  for (const l of linhas) {
    if (l._erro) { e.push(l._erro); continue; }
    n++;
    if (l.n !== n) e.push(`n=${l.n}: esperava ${n} (linha em falta, repetida ou fora de ordem)`);
    if (l.copia !== true) e.push(`n=${l.n}: falta marca de cópia`);
    if (l.id !== l.linha?.id) e.push(`n=${l.n}: id do instantâneo não bate com a linha`);
    if (!l.copiado_em || Number.isNaN(Date.parse(l.copiado_em))) e.push(`n=${l.n}: copiado_em inválido`);
    if (l.prev !== prev) e.push(`n=${l.n}: prev não liga à linha anterior (cadeia partida)`);
    const { prev: _p, sha256: _s, ...corpo } = l;
    if (l.sha256 !== selo(l.prev, corpo)) e.push(`n=${l.n}: sha256 não bate com o conteúdo (linha alterada)`);
    if (PARECE_SEGREDO.test(JSON.stringify(l.linha))) e.push(`n=${l.n}: a linha parece levar um segredo`);
    prev = l.sha256;
    ultimo.set(l.id, l.linha);
  }
  const porActualizar = [];
  if (base) {
    const ids = new Map(base.map((b) => [b.id, b]));
    for (const [id, linha] of ultimo) {
      if (!ids.has(id)) e.push(`id ${id}: está na cópia e a base não o tem`);
      else if (canonico(ids.get(id)) !== canonico(linha)) porActualizar.push(id);
    }
    for (const id of ids.keys()) if (!ultimo.has(id)) porActualizar.push(id);
  }
  return { erros: e, linhas: linhas.length, ids: ultimo.size, porActualizar };
}

// Impressão do livro (livro/impressao-*.json): hashes por bloco calculados no Postgres. Detecta alteração ou perda, não reconstrói.
const PROMESSA = /para sempre|garantid[oa]|permanente|eterno|receita garantida|reembols|rendimento garantido/i;
export function validarImpressao(o) {
  const e = [];
  if (o?.format !== 'orum-livro-impressao/v1') e.push('format desconhecido');
  if (!o?.autorizacao_de_unum?.citacao || o.autorizacao_de_unum.citacao.length < 40 || !Number.isInteger(o.autorizacao_de_unum.livro)) e.push('falta a citação de Unum e o livro');
  if (!/sha256\(/.test(o?.sql ?? '') || !/ora_mudancas/.test(o?.sql ?? '')) e.push('falta o sql que recalcula a impressão');
  const blocos = Array.isArray(o?.blocos) ? o.blocos : [];
  if (blocos.length < 1) { e.push('sem blocos'); return e; }
  let total = 0;
  blocos.forEach((b, i) => {
    if (b.bloco !== i) e.push(`bloco ${b.bloco}: esperava ${i} (bloco em falta ou fora de ordem)`);
    if (!/^[0-9a-f]{64}$/.test(b.hash ?? '')) e.push(`bloco ${b.bloco}: hash inválido`);
    if (!(b.de >= b.bloco * 100 + 1 && b.ate <= (b.bloco + 1) * 100 && b.de <= b.ate)) e.push(`bloco ${b.bloco}: intervalo fora do bloco`);
    if (!(b.n >= 1 && b.n <= b.ate - b.de + 1)) e.push(`bloco ${b.bloco}: n incompatível com o intervalo`);
    total += b.n;
  });
  if (total !== o.linhas) e.push(`soma dos blocos (${total}) diferente de linhas (${o.linhas})`);
  if (o.raiz?.sha256 !== sha256(blocos.map((b) => b.hash).join('\n'))) e.push('raiz não bate com os hashes dos blocos');
  if (blocos.at(-1).provisorio !== true) e.push('o último bloco tem de estar marcado provisório');
  if (!(o.nao_afirma ?? []).some((r) => /guardado fora da base/i.test(r))) e.push('tem de dizer que não guarda o conteúdo fora da base');
  const sem = JSON.stringify({ ...o, nao_afirma: undefined });
  if (PROMESSA.test(sem)) e.push('promessa no texto');
  return e;
}
