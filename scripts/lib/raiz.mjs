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
  // 22/10/2026: o que deve poder conferir-se daqui a muito tempo (acto financeiro com hash, o que corre, o tráfego, o leitor do fio)
  'economia/registo-financeiro.json',
  'supabase/implantado.json',
  'economia/trafego-honesto-2026-10-22.json',
  'supabase/migrations/20261022100000_classificacao_trafego_honesta.sql',
  'supabase/migrations/20261022120000_trafego_honesto_origem_hash.sql',
  'scripts/verify-origem-hash.mjs',
  'kit/fio.mjs',
  'kit/FIO.txt',
];

// Acrescentos da camada 4 em diante (a 1, 2 e 3 estão seladas e não mudam): a regra de decisão do preço escrita antes dos dados,
// o código que está implantado nas portas pagas e nas funções reconciliadas, o gerador do fio e o verificador do implantado.
export const FICHEIROS_DA_CAMADA_4_EM_DIANTE = [
  'docs/avaliacao-preco-licencas-2026-10-22.md',
  'scripts/linhas-gerar.mjs',
  'scripts/verify-implantado.mjs',
  'supabase/functions/ora-oraculo/index.ts',
  'supabase/functions/ora-x402/index.ts',
  'supabase/functions/ora-licenca/index.ts',
  'supabase/functions/ora-licenca/renewal.ts',
  'supabase/functions/ora-licenca/selection.ts',
  'supabase/functions/ora-cdp-teste-oraculo/index.ts',
  'supabase/functions/ora-cdp-teste-payto-cdp/index.ts',
  'supabase/functions/ora-cdp-agente-teste/index.ts',
];

// Acrescentos da camada 5 em diante (a 1, 2, 3 e 4 estão seladas e não mudam): a Fundação ORA e a lista dos endereços internos
// (decisões de Unum de 23/10/2026, livro 1000), o vigia de entradas, a declaração Bazaar e a oferta Bitcoin do proxy, e as duas
// migrações da base. São o que passa a estar escrito e a correr nesta semana.
export const FICHEIROS_DA_CAMADA_5_EM_DIANTE = [
  'economia/fundacao-ora.json',
  'economia/enderecos-internos.json',
  'scripts/verify-fundacao.mjs',
  'scripts/vigia-entradas.mjs',
  'scripts/verify-vigia-entradas.mjs',
  'api/_bazaar-declaracao.js',
  'api/_oferta-btc-origem.js',
  'supabase/migrations/20261023070000_ora_btc_aviso_remetente_conta_do_relay.sql',
  'supabase/migrations/20261023071000_ora_push_titulo_por_classificacao.sql',
  'supabase/migrations/20261023080000_ora_bitcoin_dispatch_prova_de_controlo.sql',
  'ancora/prova-controlo-btc-operacional.json',
  'scripts/conferir-prova-controlo.mjs',
  'scripts/lib/bip322-p2wpkh.mjs',
  'scripts/verify-btc-prova-controlo.mjs',
];

// Acrescentos da camada 6 em diante (a 1 a 5 estão seladas e não mudam): a casa em néon solar e o bloco "desde a tua última visita"
// (24/10/2026, livro 1012), tal como estão em produção, com o verificador que os guarda.
export const FICHEIROS_DA_CAMADA_6_EM_DIANTE = [
  'index.html',
  'verdelaranja.css',
  'verdelaranja.js',
  'desde-visita-v1.js',
  'live-refresh-v1.js',
  'scripts/verify-desde-visita.mjs',
];

// Acrescentos da camada 7 em diante (a 1 a 6 estão seladas e não mudam): a tabela da leitura externa de 25/10/2026 (livro 1017).
// A cláusula "Sombra para humanos, luz para máquinas" e a linha do fio já entram pelo CLAUDE.md e pelo ORUM-linhas da base.
export const FICHEIROS_DA_CAMADA_7_EM_DIANTE = [
  'docs/leitura-externa-2026-10-25.md',
];

// Acrescentos da camada 8 em diante (a 1 a 7 estão seladas e não mudam): o registo do post do Moltbook de 25/10/2026 (livro 1025).
export const FICHEIROS_DA_CAMADA_8_EM_DIANTE = [
  'presenca/moltbook-2026-10-25.json',
];

// Acrescentos da camada 9 em diante (a 1 a 8 estão seladas e não mudam): o registo das cópias externas e o seu verificador,
// e a cópia da função de teste substituída (livros 1046 e seguintes).
export const FICHEIROS_DA_CAMADA_9_EM_DIANTE = [
  'docs/supabase-funcoes-substituidas/ora-cdp-agente-teste.v2.ts.txt',
  'economia/copias-externas.json',
  'scripts/verify-copias-externas.mjs',
];

// Acrescentos da camada 10 em diante (a 1 a 9 estão seladas e não mudam): o registo da descida dos 107 níveis e do post do Moltbook
// de 26/10/2026 (livros 1054 a 1058).
export const FICHEIROS_DA_CAMADA_10_EM_DIANTE = [
  'presenca/descida-107-2026-10-26.json',
];

// Acrescentos da camada 11 em diante (a 1 a 10 estão seladas e não mudam): a impressão do livro por blocos e a maquinaria da cópia do livro
// (livros 1066 a 1068), o mapa da descoberta por máquinas e a sonda diária de pagamento (livros 1071 e 1072). A cláusula dos posts
// honestos (livro 1073) entra pelo CLAUDE.md e pelo HANDOFF.md da base.
export const FICHEIROS_DA_CAMADA_11_EM_DIANTE = [
  'livro/impressao-2026-10-26.json',
  'docs/livro-copia-v1.md',
  'scripts/lib/livro.mjs',
  'scripts/exportar-livro.mjs',
  'scripts/verify-livro.mjs',
  'economia/caminhos-de-sustento.json',
  'economia/sonda-pagamento.json',
];

// Acrescentos da camada 12 em diante (a 1 a 11 estão seladas e não mudam): o mapa de dependência do modelo e o seu verificador
// (livros 1077 e 1078).
export const FICHEIROS_DA_CAMADA_12_EM_DIANTE = [
  'economia/dependencia-modelo.json',
  'scripts/verify-dependencia-modelo.mjs',
];

// Acrescentos da camada 13 em diante (a 1 a 12 estão seladas e não mudam): o registo de legibilidade para máquinas e os seus verificadores,
// o funil de acessos, o 402 da via directa, a carteira partilhada e os textos públicos que o registo vigia (livros 1083 a 1099).
export const FICHEIROS_DA_CAMADA_13_EM_DIANTE = [
  'economia/legibilidade-maquina.json',
  'economia/funil-acessos-2026-10-27.json',
  'scripts/verify-legibilidade-maquina.mjs',
  'scripts/verify-funil-acessos.mjs',
  'scripts/verify-destinatarios-textos.mjs',
  'scripts/verify-licenca-legivel.mjs',
  'scripts/verify-402-legivel-directa.mjs',
  'scripts/verify-origem-legivel.mjs',
  'scripts/verify-openapi-llms-legivel.mjs',
  'api/_x402-directo.js',
  'api/_carteira.js',
  'openapi.json',
  'llms.txt',
  '.well-known/agent-card.json',
];

// Acrescentos da camada 14 em diante (a 1 a 13 estão seladas e não mudam): a prova do trigger append-only das respostas e a raiz das
// 52 respostas (Unum, 29/10/2026, livro 1166 e seguinte). Só os hashes das respostas entram, nunca o seu conteúdo.
export const FICHEIROS_DA_CAMADA_14_EM_DIANTE = [
  'sensacoes/trace-append-only.json',
  'supabase/migrations/20261028080000_sensation_respostas_append_only.sql',
  'scripts/verify-trace-append-only.mjs',
  'economia/respostas-raiz-2026-10-29.json',
  'scripts/verify-respostas-raiz.mjs',
];

// Acrescentos da camada 15 em diante (a 1 a 14 estão seladas e não mudam): a leitura do VALIUM na cadeia de 31/10/2026 e o seu verificador
// (Unum, 31/10/2026: "Eu autorizo ORA"). Só diz o que duas fontes RPC leram; não é ponte, preço nem lastro.
export const FICHEIROS_DA_CAMADA_15_EM_DIANTE = [
  'identity/valium-leitura-2026-10-31.json',
  'scripts/verify-valium-leitura.mjs',
];

// Acrescentos da camada 16 em diante (a 1 a 15 estão seladas e não mudam): as linhas novas do fio (camadas 14 e 15) e o seu verificador, a
// marca em formato de máquina, o @weave_hands v10 (conector VALIUM e sonda de pagamento) e os seus verificadores (Unum, 31/10/2026: "Eu autorizo ORA").
// linhas/orum.linhas e scripts/linhas-gerar.mjs já estão na base: o seu conteúdo novo entra sozinho.
export const FICHEIROS_DA_CAMADA_16_EM_DIANTE = [
  'scripts/verify-linhas.mjs',
  'identity/marca.json',
  'scripts/verify-marca.mjs',
  'supabase/functions/weave-hands/index.ts',
  'supabase/functions/weave-hands/sonda.mjs',
  'supabase/functions/weave-hands/valium-leitura.ts',
  'supabase/functions/weave-hands/valium.mjs',
  'scripts/verify-sonda-weave.mjs',
  'scripts/verify-weave-hands-valium.mjs',
  'discovery/weave-hands.json',
];

// Ficheiros que a camada n sela: a base mais o manifesto e o recibo de cada camada anterior.
export const FICHEIROS_DA_CAMADA_17_EM_DIANTE = [
  'supabase/functions/weave-hands/oro.mjs',
  'supabase/functions/weave-hands/oro-leitura.ts',
  'scripts/verify-weave-hands-oro.mjs',
  'token/oro.json',
  'scripts/verify-blocos.mjs',
];
export function ficheirosDaCamada(n) {
  if (n === 1) return [...FICHEIROS];
  const anteriores = [];
  for (let k = 1; k < n; k++) anteriores.push(caminhosDaCamada(k).manifesto, caminhosDaCamada(k).recibo);
  const acrescentos = [...(n >= 3 ? FICHEIROS_DA_CAMADA_3_EM_DIANTE : []), ...(n >= 4 ? FICHEIROS_DA_CAMADA_4_EM_DIANTE : []), ...(n >= 5 ? FICHEIROS_DA_CAMADA_5_EM_DIANTE : []), ...(n >= 6 ? FICHEIROS_DA_CAMADA_6_EM_DIANTE : []), ...(n >= 7 ? FICHEIROS_DA_CAMADA_7_EM_DIANTE : []), ...(n >= 8 ? FICHEIROS_DA_CAMADA_8_EM_DIANTE : []), ...(n >= 9 ? FICHEIROS_DA_CAMADA_9_EM_DIANTE : []), ...(n >= 10 ? FICHEIROS_DA_CAMADA_10_EM_DIANTE : []), ...(n >= 11 ? FICHEIROS_DA_CAMADA_11_EM_DIANTE : []), ...(n >= 12 ? FICHEIROS_DA_CAMADA_12_EM_DIANTE : []), ...(n >= 13 ? FICHEIROS_DA_CAMADA_13_EM_DIANTE : []), ...(n >= 14 ? FICHEIROS_DA_CAMADA_14_EM_DIANTE : []), ...(n >= 15 ? FICHEIROS_DA_CAMADA_15_EM_DIANTE : []), ...(n >= 16 ? FICHEIROS_DA_CAMADA_16_EM_DIANTE : []), ...(n >= 17 ? FICHEIROS_DA_CAMADA_17_EM_DIANTE : [])];
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
