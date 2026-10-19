// Raiz dos registos: o SHA-256 de uma lista de texto simples, reproduzível com sha256sum.
// Cada linha: "<caminho>\t<sha256 do ficheiro>\n", ordenadas por caminho (ordem de bytes).
import crypto from 'node:crypto';

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
