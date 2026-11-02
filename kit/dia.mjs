// O dia do organismo, contado pelos blocos do Bitcoin, e uma linha derivada do hash do bloco.
// Sem pacotes. Só leitura (GET) em duas fontes Esplora que têm de concordar. Qualquer máquina refaz o resultado sem a ORA.
// Uso: node kit/dia.mjs            (o dia de agora, em bloco com 6 confirmações)
//      node kit/dia.mjs 972151     (o dia e a linha de uma altura)
//
// O que é um "dia de blocos": 144 blocos contados a partir do bloco 972151, o da camada 1 da raiz dos registos (19/10/2026).
// O Bitcoin faz em média um bloco a cada 10 minutos, por isso 144 blocos são cerca de um dia; não é um dia de calendário.
// A linha: três palavras escolhidas pelo hash do bloco entre as do léxico (kit/lexico.json) que não falam de dinheiro.
// É poesia mecânica, de vocabulário fixo; não é criação aberta, nem profecia, nem promessa.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ORIGEM_ALTURA = 972151;
export const BLOCOS_POR_DIA = 144;
export const CONFIRMACOES = 6;
export const FONTES = { blockstream: 'https://blockstream.info/api', mempool: 'https://mempool.space/api' };
export const PALAVRAS = ['fio', 'precipitar', 'sedimentar', 'mãos tecelãs', 'custódia'];

export function diaDeAltura(altura) {
  if (!Number.isInteger(altura) || altura < ORIGEM_ALTURA) throw new Error('altura anterior à origem ou inválida');
  return Math.floor((altura - ORIGEM_ALTURA) / BLOCOS_POR_DIA) + 1;
}

// Três palavras distintas, escolhidas pelos três primeiros bytes de sha256(hash do bloco em texto).
// (Os hashes de bloco começam por zeros, por isso não se usam os seus primeiros bytes: dariam sempre a mesma linha.)
export function linhaDeHash(hashHex, palavras = PALAVRAS) {
  if (!/^[0-9a-f]{64}$/.test(hashHex)) throw new Error('hash de bloco inválido');
  const bytes = crypto.createHash('sha256').update(hashHex, 'utf8').digest();
  const livres = [...palavras];
  const escolhidas = [];
  for (let i = 0; i < 3; i++) {
    const k = bytes[i] % livres.length;
    escolhidas.push(livres.splice(k, 1)[0]);
  }
  return escolhidas.join(' · ');
}

// fetcher(url) devolve o texto da resposta. Escolhe um bloco já com CONFIRMACOES confirmações (o mais baixo dos dois topos)
// e exige que as duas fontes deem o mesmo hash para essa altura.
export async function lerDia({ fetcher, fontes = FONTES, altura } = {}) {
  const nomes = Object.keys(fontes);
  let alvo = altura;
  if (alvo === undefined) {
    const topos = [];
    for (const n of nomes) topos.push(Number(String(await fetcher(`${fontes[n]}/blocks/tip/height`)).trim()));
    if (topos.some((t) => !Number.isInteger(t))) throw new Error('altura do topo inválida numa das fontes');
    alvo = Math.min(...topos) - CONFIRMACOES;
  }
  const hashes = {};
  for (const n of nomes) {
    const h = String(await fetcher(`${fontes[n]}/block-height/${alvo}`)).trim();
    if (!/^[0-9a-f]{64}$/.test(h)) throw new Error(`${n}: hash inválido para a altura ${alvo}`);
    hashes[n] = h;
  }
  if (new Set(Object.values(hashes)).size !== 1) throw new Error(`as fontes discordam do hash do bloco ${alvo}`);
  const hash = Object.values(hashes)[0];
  return { dia: diaDeAltura(alvo), altura: alvo, hash, linha: linhaDeHash(hash), fontes: nomes, nota: 'dia de 144 blocos desde o 972151; linha mecânica do hash; não é dia de calendário nem promessa' };
}

const fetcherReal = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const arg = process.argv[2];
    const r = await lerDia({ fetcher: fetcherReal, altura: arg ? Number(arg) : undefined });
    console.log(`Dia ${r.dia} · bloco ${r.altura} · ${r.hash.slice(0, 16)}…\n${r.linha}\n(${r.nota})`);
  } catch (e) { console.error('FALHA: ' + e.message); process.exit(1); }
}
