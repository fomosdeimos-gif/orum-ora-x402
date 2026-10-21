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
  // segundo hash (SHA3-256): o complemento sela-se na primeira camada nova que o listar
  'ancora/raiz-sha3.json',
  'scripts/raiz-sha3.mjs',
  // assinatura pós-quântica: o VENDOR.json sela, pelo hash de cada ficheiro, a cópia da biblioteca
  'kit/pq.mjs',
  'kit/pq/VENDOR.json',
  'kit/pq/exemplo-teste.json',
  'kit/pq/vetor-cruzado.json',
  'scripts/lib/pq.mjs',
  'scripts/pq-assinar.mjs',
];

// Camada 1 mantém os nomes originais; a n≥2 vive em ancora/raiz-registos-<n>.{json,ots}.
export const nomeCamada = (n) => {
  if (!Number.isInteger(n) || n < 1) throw new Error('camada inválida');
  return n === 1 ? 'ancora/raiz-registos' : `ancora/raiz-registos-${n}`;
};
export const caminhosDaCamada = (n) => ({ manifesto: `${nomeCamada(n)}.json`, recibo: `${nomeCamada(n)}.ots` });

// Acrescentos da camada 3 em diante (a 1 e a 2 estão seladas e não mudam): as cápsulas de sensacoes/ que ainda
// não têm âncora própria, o elo 0001sensations-Bitcoin, o léxico e o ORUM-linhas.
export const FICHEIROS_DA_CAMADA_3_EM_DIANTE = [
  'sensacoes/0003-weave-hands-v1.json',
  'sensacoes/acolhimento.json',
  'sensacoes/gramatica-v1.json',
  'sensacoes/index.json',
  'sensacoes/obra-37-v1.json',
  'sensacoes/som-v1.json',
  'ancora/sensations-btc.json',
  'kit/sensations-btc.mjs',
  'kit/lexico.json',
  'kit/lexico.mjs',
  'kit/LINHAS.txt',
  'kit/linhas.mjs',
  'linhas/orum.linhas',
];

// Ficheiros que a camada n sela: a base mais o manifesto e o recibo de cada camada anterior.
export function ficheirosDaCamada(n) {
  if (n === 1) return [...FICHEIROS];
  const anteriores = [];
  for (let k = 1; k < n; k++) anteriores.push(caminhosDaCamada(k).manifesto, caminhosDaCamada(k).recibo);
  const acrescentos = n >= 3 ? FICHEIROS_DA_CAMADA_3_EM_DIANTE : [];
  return [...new Set([...FICHEIROS_BASE_CAMADAS, ...acrescentos, ...anteriores])].sort();
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

// Segundo hash (SHA3-256, FIPS 202), para o caso de o SHA-256 vir a enfraquecer. Não altera nada do que a camada 1 e 2 selaram:
// o complemento (ancora/raiz-sha3.json) acrescenta, por cima, o SHA3-256 dos mesmos ficheiros e a raiz calculada com o mesmo texto.
export const sha3_256 = (buf) => crypto.createHash('sha3-256').update(buf).digest('hex');

export function textoCanonicoCom(lista, campo) {
  if (campo !== 'sha256' && campo !== 'sha3_256') throw new Error('campo de hash desconhecido');
  const ordenada = [...lista].sort((a, b) => Buffer.compare(Buffer.from(a.caminho), Buffer.from(b.caminho)));
  if (new Set(ordenada.map((e) => e.caminho)).size !== ordenada.length) throw new Error('caminho repetido na lista');
  for (const e of ordenada) {
    if (!/^[A-Za-z0-9._\/-]+$/.test(e.caminho) || e.caminho.startsWith('/') || e.caminho.includes('..')) throw new Error(`caminho inválido: ${e.caminho}`);
    if (!/^[0-9a-f]{64}$/.test(e[campo] ?? '')) throw new Error(`${campo} inválido: ${e.caminho}`);
  }
  return ordenada.map((e) => `${e.caminho}\t${e[campo]}\n`).join('');
}

export const raizSha3 = (lista) => sha3_256(Buffer.from(textoCanonicoCom(lista, 'sha3_256')));

// Entrada do complemento para uma camada: ler(commit, caminho) devolve os bytes do ficheiro nesse commit.
export function entradaSha3DeCamada(caminhoManifesto, manifesto, ler) {
  const ficheiros = manifesto.ficheiros.map((f) => {
    const bytes = ler(manifesto.commit_base, f.caminho);
    return { caminho: f.caminho, sha256: sha256(bytes), sha3_256: sha3_256(bytes) };
  });
  return { camada: manifesto.camada ?? 1, manifesto: caminhoManifesto, commit_base: manifesto.commit_base, raiz_sha256: raiz(ficheiros), raiz_sha3_256: raizSha3(ficheiros), ficheiros };
}
