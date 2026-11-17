// A casa do organismo como algoritmo: uma função pura. Entra o que o organismo publica (pulso, tesouraria, catálogo)
// e a hora; sai o estado da casa, com o texto que cada elemento da página mostra. Sem pacotes, sem DOM, sem estado.
// Uso: node kit/casa.mjs                         (lê https://ora-x402-gateway.vercel.app, só GET)
//      node kit/casa.mjs --base <url>            (outra origem)
//      node kit/casa.mjs --pulso p.json --tesouraria t.json --catalogo c.json   (ficheiros, sem rede)
//      node kit/casa.mjs --bloco                 (junta o dia e a linha de kit/dia.mjs, em duas fontes Esplora)
//
// Verdade: onde não houve leitura, o estado diz "por consultar" ou "indisponível" e o valor fica "—"; "—" não é zero.
// A função não conta pessoas, não promete receita, reembolso nem procura, e não move nada. É a mesma regra que
// verdelaranja.js aplica no navegador; scripts/verify-casa-algoritmo.mjs corre os dois e exige o mesmo texto, id a id.
// Sem leitura anterior: o script do navegador guarda a última leitura boa; esta função não tem memória, por isso
// a falha diz sempre "sem leitura".
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FORMATO = 'orum-casa/v1';
export const BASE_PUBLICA = 'https://ora-x402-gateway.vercel.app';
export const FRONTEIRAS = [
  'Os acessos são reconhecidos pela fonte; não são pessoas únicas nem compradores.',
  'Não prova procura nem receita.',
  'Receita externa reportada segundo a contabilidade pública; o património e os testes ficam separados.',
  'Abrir um pedido x402 não efectua uma compra.',
];
const TIPOS = ['consulta', 'editorial', 'treino'];
const ROTULOS = { consulta: 'Para observar', editorial: 'Para publicar', treino: 'Para investigar' };
const MIN30 = 30 * 60 * 1000;
const DIA24 = 24 * 60 * 60 * 1000;

const numero = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const formatar = (v) => (numero(v) ? v.toLocaleString('pt-PT', { maximumFractionDigits: 6 }) : '—');
const quando = (v) => {
  const d = new Date(v);
  return v && Number.isFinite(d.getTime())
    ? d.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'hora desconhecida';
};
const antigo = (v, idade, agora) => !v || !Number.isFinite(Date.parse(v)) || agora - Date.parse(v) > idade;

function rastos(lista, limite = 3) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : [])
    .filter((e) => { const k = JSON.stringify([e.tipo, e.quando, e.detalhe]); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .slice(0, limite)
    .map((e) => ({ quando: e.quando ?? null, hora: quando(e.quando), texto: e.detalhe || e.tipo || 'Evento sem descrição' }));
}

// Pulso: 'viva' | 'copia' | 'indisponivel'. Devolve os textos visíveis e o estado da fonte.
function lerPulso(dado, agora) {
  const ind = {
    estado: 'indisponivel',
    visivel: {
      pulseSummary: 'Pulso sem confirmação atual', pulseStatus: 'Pulso: atualização indisponível. Ainda sem leitura; “—” não significa zero.',
      fieldDay: 'Tempo do organismo —', accessCount: '—', sentinelState: 'Por consultar',
      sentinelDescription: 'O estado só aparece depois de uma leitura.', pulseSourceTime: 'Hora da fonte desconhecida.',
    },
    ponto: 'status-dot stale', eventos: [], semEventos: 'A aguardar acontecimentos.',
  };
  try {
    if (dado && dado.estado === 'snapshot_desactualizado') {
      if (!dado.campo) throw new Error('Pulso incompleto');
      const obs = quando(dado.snapshot_observado_em);
      const ev = rastos(dado.eventos);
      return {
        estado: 'copia',
        visivel: {
          fieldDay: numero(dado.campo.dia) ? 'Dia ' + formatar(dado.campo.dia) + ' do organismo' : 'Tempo do organismo desconhecido',
          accessCount: '—', sentinelState: 'Sem vigilância viva',
          sentinelDescription: 'A fonte viva não respondeu. Isto é uma cópia de recurso e não prova actividade posterior.',
          pulseSourceTime: 'Cópia de recurso observada em ' + obs + ' (Lisboa).',
          pulseSummary: 'Cópia de recurso · desactualizada',
          pulseStatus: 'Pulso: fonte viva indisponível; a mostrar a cópia de recurso de ' + obs + ' (Lisboa). “—” não significa zero.',
        },
        ponto: 'status-dot stale', eventos: ev, semEventos: 'Nenhum acontecimento nesta cópia.',
      };
    }
    if (!dado || !dado.campo || !dado.sentinela || !dado.convite) throw new Error('Pulso incompleto');
    const velho = antigo(dado.sentinela.verificado_em, MIN30, agora);
    return {
      estado: velho ? 'viva_antiga' : 'viva',
      visivel: {
        accessCount: formatar(dado.convite.maquinas_reconhecidas_total),
        fieldDay: numero(dado.campo.dia) ? 'Dia ' + formatar(dado.campo.dia) + ' do organismo' : 'Tempo do organismo desconhecido',
        sentinelState: dado.sentinela.veredicto || 'Sem veredicto',
        sentinelDescription: dado.sentinela.frase || 'A fonte não publicou uma descrição.',
        pulseSourceTime: 'Sentinela: ' + quando(dado.sentinela.verificado_em) + ' (Lisboa).',
        pulseSummary: velho ? 'Vigilância por atualizar' : 'Pulso consultado · ' + (dado.sentinela.veredicto || 'sem veredicto'),
        pulseStatus: 'Pulso: ' + (velho ? 'vigilância com mais de 30 min ou hora desconhecida.' : 'leitura recebida às ' + quando(agora) + '.'),
      },
      ponto: 'status-dot ' + (velho ? 'stale' : 'observed'), eventos: rastos(dado.eventos), semEventos: 'Nenhum acontecimento nesta leitura.',
    };
  } catch (_) { return ind; }
}

function lerTesouraria(dado, agora) {
  try {
    if (!dado?.evidence?.source?.available || !numero(dado.evidence.external_confirmed_usdc)) throw new Error('Contabilidade incompleta');
    const obs = dado.evidence.source.observed_at;
    const velho = antigo(obs, DIA24, agora);
    return {
      estado: velho ? 'antiga' : 'actual',
      visivel: {
        revenue: formatar(dado.evidence.external_confirmed_usdc),
        treasuryStatus: 'Contabilidade: dados da fonte de ' + quando(obs) + ' (Lisboa).' + (velho ? ' Leitura antiga ou hora desconhecida.' : ''),
      },
    };
  } catch (_) {
    return { estado: 'indisponivel', visivel: { revenue: '—', treasuryStatus: 'Contabilidade: atualização indisponível. Ainda sem leitura; “—” não significa zero.' } };
  }
}

function lerCatalogo(dado, agora, obraPedida) {
  const sem = {
    estado: 'indisponivel', obras: [], obra: null, licencas: [], mensagemLicencas: 'Licenças por reconfirmar. Consulta o catálogo ou atualiza a leitura.',
    visivel: {
      workId: '0001', workTitle: 'Uma obra à tua espera', workPosition: '— / —', workHash: 'Por consultar', selectedWork: 'Por consultar',
      workDescription: 'A consultar o catálogo público. As fotografias têm acesso privado por licença.',
      catalogStatus: 'Não foi possível atualizar o catálogo. Podes tentar de novo em “Atualizar leitura” ou abrir a fonte.',
    },
  };
  try {
    if (!dado || !Array.isArray(dado.obras) || !dado.obras.length || !Array.isArray(dado.licencas)) throw new Error('Catálogo incompleto');
    const obras = dado.obras.filter((o) => Number.isInteger(o.id) && o.id > 0);
    if (!obras.length) throw new Error('Sem obras válidas');
    const escolhida = obras.find((o) => o.id === obraPedida) || obras.find((o) => o.id === 2) || obras[0];
    const rotulo = escolhida.id.toString().padStart(3, '0') + (escolhida.titulo ? ' · ' + escolhida.titulo : ' · Sem título declarado');
    const licencas = [];
    for (const l of dado.licencas) {
      if (!TIPOS.includes(l.tipo)) continue;
      const temHash = typeof escolhida.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(escolhida.sha256);
      licencas.push({
        tipo: l.tipo, rotulo: ROTULOS[l.tipo], preco: l.preco || 'Preço por consultar',
        descricao: l.descricao || 'Consultar os termos no catálogo.',
        duracao: 'Licença: ' + (l.duracao_da_licenca || 'duração não indicada') + '.',
        pedido: temHash ? '/licenca/' + l.tipo + '?' + new URLSearchParams({ obra: String(escolhida.id), sha256: escolhida.sha256 }) : null,
        aviso: temHash ? null : 'Pedido indisponível: falta o hash da obra.',
      });
    }
    return {
      estado: 'actual', obras: obras.map((o) => ({ id: o.id, rotulo: String(o.id).padStart(3, '0') + (o.titulo ? ' · ' + o.titulo : ' · Sem título') })),
      obra: escolhida.id, licencas, mensagemLicencas: licencas.length ? null : 'Não há licenças disponíveis nesta leitura do catálogo.',
      visivel: {
        workId: 'OBRA ' + String(escolhida.id).padStart(3, '0'), workTitle: escolhida.titulo || 'Sem título declarado',
        workDescription: escolhida.descricao_visivel || 'Esta obra ainda não tem um vestígio textual publicado.',
        workPosition: (obras.indexOf(escolhida) + 1) + ' / ' + obras.length, workHash: escolhida.sha256 || 'Hash não publicado', selectedWork: rotulo,
        catalogStatus: 'Catálogo consultado às ' + quando(agora) + '. Fotografias privadas; esta amostra é textual.',
      },
    };
  } catch (_) { return sem; }
}

// Obra do dia: escolhida pelo hash do bloco (kit/dia.mjs), por sha256 do hash e do número de obras. Determinista.
export function obraDoDia(hashBloco, obras) {
  if (!/^[0-9a-f]{64}$/.test(hashBloco || '') || !Array.isArray(obras) || !obras.length) return null;
  const b = crypto.createHash('sha256').update('casa:' + hashBloco, 'utf8').digest();
  return obras[b.readUInt32BE(0) % obras.length].id;
}

// A função. `agora` é um número (ms) ou uma data; `bloco` (opcional) é o resultado de lerDia: { dia, altura, hash, linha }.
export function casa({ pulso, tesouraria, catalogo, agora, obra, bloco } = {}) {
  const t = agora instanceof Date ? agora.getTime() : agora;
  if (!Number.isFinite(t)) throw new Error('agora inválido');
  const p = lerPulso(pulso, t);
  const e = lerTesouraria(tesouraria, t);
  const c = lerCatalogo(catalogo, t, obra);
  const saida = {
    formato: FORMATO,
    lido_em: new Date(t).toISOString(),
    fontes: { pulso: p.estado, tesouraria: e.estado, catalogo: c.estado },
    visivel: { ...p.visivel, ...e.visivel, ...c.visivel },
    ponto: p.ponto,
    eventos: p.eventos.length ? p.eventos : [],
    sem_eventos: p.eventos.length || !p.semEventos ? null : p.semEventos,
    obras: c.obras,
    obra: c.obra,
    licencas: c.licencas,
    mensagem_licencas: c.mensagemLicencas,
    fronteiras: FRONTEIRAS,
    bloco: bloco ? { dia: bloco.dia, altura: bloco.altura, hash: bloco.hash, linha: bloco.linha } : null,
    obra_do_dia: bloco && c.estado === 'actual' ? obraDoDia(bloco.hash, c.obras) : null,
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
