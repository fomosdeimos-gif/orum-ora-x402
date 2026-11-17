// A casa do organismo como algoritmo: uma função pura. Entra o que o organismo publica (pulso, tesouraria, catálogo)
// e a hora; sai o estado da casa, com o texto que cada elemento da página mostra. Sem pacotes, sem DOM, sem estado.
// Uso: node kit/casa.mjs                         (lê https://ora-x402-gateway.vercel.app, só GET)
//      node kit/casa.mjs --base <url>            (outra origem)
//      node kit/casa.mjs --pulso p.json --tesouraria t.json --catalogo c.json   (ficheiros, sem rede)
//      node kit/casa.mjs --bloco                 (junta o dia e a linha de kit/dia.mjs, em duas fontes Esplora)
//
// Verdade: onde não houve leitura, o estado diz "por consultar" ou "indisponível" e o valor fica "—"; "—" não é zero.
// A função não conta pessoas, não promete receita, reembolso nem procura, e não move nada. É a mesma regra que a casa
// carrega no navegador (casa-nucleo.js, ligado pelo index.html); scripts/verify-casa-algoritmo.mjs compara a casca com a
// casa anterior (scripts/fixtures/verdelaranja-anterior.js) e exige a página inteira igual.
// A regra vive num só sítio, casa-nucleo.js (o navegador carrega o mesmo ficheiro). Esta função junta as três leituras,
// a obra do dia e a impressão. Sem memória própria: quem a tiver (a casca do navegador) diz `memoria` e `falhou`.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRequire } from 'node:module';
const N = createRequire(import.meta.url)('../casa-nucleo.js');

export const { FORMATO, FRONTEIRAS } = N;
export const BASE_PUBLICA = 'https://ora-x402-gateway.vercel.app';

// Obra do dia: escolhida pelo hash do bloco (kit/dia.mjs), por sha256 do hash e do número de obras. Determinista.
export function obraDoDia(hashBloco, obras) {
  if (!/^[0-9a-f]{64}$/.test(hashBloco || '') || !Array.isArray(obras) || !obras.length) return null;
  const b = crypto.createHash('sha256').update('casa:' + hashBloco, 'utf8').digest();
  return obras[b.readUInt32BE(0) % obras.length].id;
}

// A função. `agora` é um número (ms) ou uma data; `bloco` (opcional) é o resultado de lerDia: { dia, altura, hash, linha }.
// `memoria` ({ pulso, tesouraria }) diz se já houve leitura boa; `falhou` ({ catalogo }) que a última tentativa falhou (então `catalogo` é a última boa).
export function casa({ pulso, tesouraria, catalogo, agora, obra, bloco, memoria = {}, falhou = {} } = {}) {
  const t = agora instanceof Date ? agora.getTime() : agora;
  if (!Number.isFinite(t)) throw new Error('agora inválido');
  const p = N.lerPulso(pulso, t, memoria.pulso);
  const e = N.lerTesouraria(tesouraria, t, memoria.tesouraria);
  const c = N.lerCatalogo(catalogo, t, { obra, falhou: falhou.catalogo });
  const saida = {
    formato: FORMATO,
    lido_em: new Date(t).toISOString(),
    fontes: { pulso: p.estado, tesouraria: e.estado, catalogo: c.estado },
    visivel: { ...p.visivel, ...e.visivel, ...c.obraVisivel, catalogStatus: c.catalogStatus },
    ponto: p.ponto,
    eventos: p.eventos,
    sem_eventos: p.eventos.length ? null : p.semEventos,
    obras: c.obras,
    obra: c.obra,
    licencas: c.licencas,
    mensagem_licencas: c.mensagemLicencas,
    fronteiras: FRONTEIRAS,
    bloco: bloco ? { dia: bloco.dia, altura: bloco.altura, hash: bloco.hash, linha: bloco.linha } : null,
    obra_do_dia: bloco && c.obras.length ? obraDoDia(bloco.hash, c.obras) : null,
  };
  saida.impressao = impressao(saida);
  return saida;
}

// sha256 do JSON canónico (chaves por ordem) de tudo menos a própria impressão.
export function impressao(s) {
  const { impressao: _, ...resto } = s;
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  return crypto.createHash('sha256').update(JSON.stringify(canon(resto)), 'utf8').digest('hex');
}

async function get(url) {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
  return r.json();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
  try {
    const fs = await import('node:fs');
    const base = arg('base') || BASE_PUBLICA;
    const ler = async (nome, rota) => {
      const f = arg(nome);
      if (f) return JSON.parse(fs.readFileSync(f, 'utf8'));
      try { return await get(base + rota); } catch (_) { return null; }
    };
    const entrada = {
      pulso: await ler('pulso', '/pulso'), tesouraria: await ler('tesouraria', '/economia/tesouraria.json'),
      catalogo: await ler('catalogo', '/licenca'), agora: Date.now(),
    };
    if (process.argv.includes('--bloco')) {
      const { lerDia } = await import('./dia.mjs');
      const f = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(u + ': HTTP ' + r.status); return r.text(); };
      try { entrada.bloco = await lerDia({ fetcher: f }); } catch (e) { console.error('bloco não lido: ' + e.message); }
    }
    console.log(JSON.stringify(casa(entrada), null, 2));
  } catch (e) { console.error('FALHA: ' + e.message); process.exit(1); }
}
