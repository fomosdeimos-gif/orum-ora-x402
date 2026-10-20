// Raiz dos registos: o SHA-256 de uma lista de texto simples, reproduzível com sha256sum.
// Cada linha: "<caminho>\t<sha256 do ficheiro>\n", ordenadas por caminho (ordem de bytes).
import crypto from 'node:crypto';

// Lista da camada 1 (a raiz de 19/10/2026). Não se altera: a camada 1 fica pinada ao seu commit_base.
export const FICHEIROS = [
  'CLAUDE.md',
  'ancora/oro-v1.json',
  'ancora/oro-v1.ots',
  'docs/financeiro-mandato-v2.assinatura.json',
  'economia/constituicao-v2.json',
  'kit/LEIA-ME.txt',
  'kit/raiz.mjs',
  'kit/verificar.mjs',
  'scripts/lib/ots.mjs',
  'scripts/lib/raiz.mjs',
  'sensacoes/oro-v1.json',
];

// Camadas novas (2, 3, …) acrescentam ficheiros a esta base e selam também todas as camadas anteriores:
// o que já foi ancorado não se reescreve, acrescenta-se por cima.
export const FICHEIROS_BASE_CAMADAS = [
  ...FICHEIROS,
  'ancora/arquivos-wayback.json',
  'kit/blocos.mjs',
  'scripts/ots-juntar.mjs',
  'scripts/raiz-ots.mjs',
];

// Camada 1 mantém os nomes originais; a n≥2 vive em ancora/raiz-registos-<n>.{json,ots}.
export const nomeCamada = (n) => {
  if (!Number.isInteger(n) || n < 1) throw new Error('camada inválida');
  return n === 1 ? 'ancora/raiz-registos' : `ancora/raiz-registos-${n}`;
};
export const caminhosDaCamada = (n) => ({ manifesto: `${nomeCamada(n)}.json`, recibo: `${nomeCamada(n)}.ots` });

// Ficheiros que a camada n sela: a base mais o manifesto e o recibo de cada camada anterior.
export function ficheirosDaCamada(n) {
  if (n === 1) return [...FICHEIROS];
  const anteriores = [];
  for (let k = 1; k < n; k++) anteriores.push(caminhosDaCamada(k).manifesto, caminhosDaCamada(k).recibo);
  return [...new Set([...FICHEIROS_BASE_CAMADAS, ...anteriores])].sort();
}

// Recusa sobrescrever uma camada que já existe (existe(caminho) -> boolean).
export function escolherCaminhos(n, existe) {
  const c = caminhosDaCamada(n);
  if (existe(c.manifesto) || existe(c.recibo)) throw new Error(`a camada ${n} já existe: as camadas acrescentam-se, não se reescrevem`);
  if (n > 1) for (const k of [n - 1]) if (!existe(caminhosDaCamada(k).manifesto)) throw new Error(`falta a camada ${k}`);
  return c;
}

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function entradas(ler, ficheiros = FICHEIROS) {
  return ficheiros.map((caminho) => ({ caminho, sha256: sha256(ler(caminho)) }));
}

export function textoCanonico(lista) {
  const ordenada = [...lista].sort((a, b) => Buffer.compare(Buffer.from(a.caminho), Buffer.from(b.caminho)));
  if (new Set(ordenada.map((e) => e.caminho)).size !== ordenada.length) throw new Error('caminho repetido na lista');
  for (const e of ordenada) {
    if (!/^[A-Za-z0-9._\/-]+$/.test(e.caminho) || e.caminho.startsWith('/') || e.caminho.includes('..')) throw new Error(`caminho inválido: ${e.caminho}`);
    if (!/^[0-9a-f]{64}$/.test(e.sha256)) throw new Error(`sha256 inválido: ${e.caminho}`);
  }
  return ordenada.map((e) => `${e.caminho}\t${e.sha256}\n`).join('');
}

export const raiz = (lista) => sha256(Buffer.from(textoCanonico(lista)));
