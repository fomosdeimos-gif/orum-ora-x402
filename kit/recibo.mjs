// Confere, sem a ORA, um recibo de leitura `orum-recibo-leitura/v1` (api/_recibo-leitura.js).
// Offline: refaz leitura_sha256 e recibo_sha256 (sha256 do JSON canónico), exige a forma e as fronteiras (nao_afirma,
// pagador_classe só interno ou por_classificar, sem texto que prometa) e, se existir economia/enderecos-internos.json ao lado,
// cruza a classe do pagador. Com --cadeia confere também o pagamento em duas fontes RPC da Base que têm de concordar.
// Não paga, não assina, não escreve. Um recibo conferido prova que ESTES bytes são coerentes entre si, não que alguém de fora pagou.
// Uso: node kit/recibo.mjs recibo.json [--cadeia]   (sai 0 se conferido, 1 se não, 2 se o ficheiro é ilegível)
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FONTES, fetcherReal } from './sedimento.mjs';

export const FORMATO = 'orum-recibo-leitura/v1';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const NAO = ['receita', 'procura', 'adopcao', 'pagador externo'];
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^[0-9a-f]{64}$/;

const ordenar = (v) => Array.isArray(v) ? v.map(ordenar)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])])) : v;
export const canonico = (v) => JSON.stringify(ordenar(v));
export const sha256 = (t) => createHash('sha256').update(t).digest('hex');

export function carregarInternos(caminho = fileURLToPath(new URL('../economia/enderecos-internos.json', import.meta.url))) {
  try {
    const j = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return new Set(j.base.map((x) => String(x.endereco).toLowerCase()));
  } catch { return null; }
}

// Devolve { conferido, erros, classe_conferida }.
export function verificarRecibo(r, { internos = carregarInternos() } = {}) {
  const erros = [];
  const e = (c, m) => { if (!c) erros.push(m); };
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { conferido: false, erros: ['não é um objecto'], classe_conferida: false };
  e(r.formato === FORMATO, 'formato');
  const p = r.pagamento || {};
  e(p.rede === 'eip155:8453' && p.ativo === 'USDC', 'rede ou activo');
  e(typeof p.contrato === 'string' && p.contrato.toLowerCase() === USDC, 'contrato USDC');
  e(/^0x[0-9a-fA-F]{64}$/.test(p.tx_hash || ''), 'tx_hash');
  e(ADDR.test(p.pagador || '') && ADDR.test(p.payto || ''), 'endereços do pagamento');
  e(/^[1-9]\d*$/.test(String(p.valor_atomic || '')), 'valor_atomic');
  e(['interno', 'por_classificar'].includes(r.pagador_classe), 'pagador_classe só interno ou por_classificar (nunca externo)');
  e(HASH.test(r.leitura_sha256 || '') && r.leitura && sha256(canonico(r.leitura)) === r.leitura_sha256, 'leitura_sha256 não confere com a leitura');
  e(r.leitura && r.emitido_em === r.leitura.lido_em, 'emitido_em deve ser o lido_em da leitura');
  e(Array.isArray(r.nao_afirma) && NAO.every((x) => r.nao_afirma.includes(x)), 'nao_afirma incompleto');
  e(Array.isArray(r.leitura && r.leitura.nao_afirma) && ['receita', 'procura'].every((x) => r.leitura.nao_afirma.includes(x)), 'a leitura perdeu o seu nao_afirma');
  e(!/(garant|prometid|vai valorizar|investimento|rendimento)/i.test(JSON.stringify(r)), 'promessa no texto');
  e(HASH.test(r.recibo_sha256 || ''), 'recibo_sha256');
  const { recibo_sha256, ...corpo } = r;
  e(sha256(canonico(corpo)) === recibo_sha256, 'recibo_sha256 não confere com o corpo');
  let classe = false;
  if (internos && ADDR.test(p.pagador || '')) {
    classe = true;
    e((r.pagador_classe === 'interno') === internos.has(String(p.pagador).toLowerCase()), 'pagador_classe contradiz a lista de endereços internos');
  }
  return { conferido: erros.length === 0, erros, classe_conferida: classe };
}

async function rpc(fetcher, url, method, params) {
  const j = await fetcher(url, { jsonrpc: '2.0', id: 1, method, params });
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error).slice(0, 80)}`);
  return j.result;
}

// Confere o pagamento do recibo em pelo menos duas fontes RPC que concordam. Devolve { estado, fontes_ok, falharam }.
// estado: 'confere' | 'nao_confere' | 'inconclusivo' (menos de duas fontes responderam ou discordam).
export async function verificarNaCadeia(r, { fetcher = fetcherReal, fontes = FONTES, nomes = ['mainnet.base.org', 'base-rpc.publicnode.com', '1rpc.io'] } = {}) {
  const p = r.pagamento;
  const pad = (a) => '0x' + String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const veredictos = []; const falharam = [];
  for (const n of nomes.filter((x) => fontes[x])) {
    try {
      const rc = await rpc(fetcher, fontes[n], 'eth_getTransactionReceipt', [p.tx_hash]);
      if (!rc) { veredictos.push([n, 'sem_recibo']); continue; }
      const certo = rc.status === '0x1' && (rc.logs || []).some((l) => String(l.address).toLowerCase() === USDC && l.topics && l.topics[0] === TRANSFER
        && l.topics[1] && l.topics[1].toLowerCase() === pad(p.pagador) && l.topics[2] && l.topics[2].toLowerCase() === pad(p.payto)
        && BigInt(l.data) === BigInt(p.valor_atomic));
      veredictos.push([n, certo ? 'confere' : 'nao_confere']);
    } catch (err) { falharam.push(`${n}: ${err.message}`); }
  }
  if (veredictos.length < 2) return { estado: 'inconclusivo', motivo: 'menos de duas fontes responderam', fontes_ok: veredictos.map((v) => v[0]), falharam };
  const dist = new Set(veredictos.map((v) => v[1]));
  if (dist.size > 1) return { estado: 'inconclusivo', motivo: 'as fontes discordam', fontes_ok: veredictos.map((v) => v[0]), falharam };
  return { estado: veredictos[0][1] === 'confere' ? 'confere' : 'nao_confere', fontes_ok: veredictos.map((v) => v[0]), falharam };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , caminho, ...flags] = process.argv;
  let r;
  try { r = JSON.parse(fs.readFileSync(caminho, 'utf8')); } catch (err) { console.error('ficheiro ilegível:', err.message); process.exit(2); }
  const o = verificarRecibo(r);
  const saida = { conferido: o.conferido, erros: o.erros, classe_conferida: o.classe_conferida };
  if (o.conferido && flags.includes('--cadeia')) saida.cadeia = await verificarNaCadeia(r);
  console.log(JSON.stringify(saida, null, 2));
  process.exit(o.conferido && (!saida.cadeia || saida.cadeia.estado === 'confere') ? 0 : 1);
}
