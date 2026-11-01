// Lê, só em leitura, as moedas que Unum disse ter criado (Base) e grava token/moedas-de-unum-<data>.json.
// Um valor só entra em "lido" se as fontes RPC que responderam forem pelo menos duas e iguais; senão vai para "nao_verificado".
// A autoria é palavra de Unum (sessão de 01/11/2026): a cadeia lida aqui não a prova. Não move fundos, não escreve na cadeia.
// Uso: node scripts/moedas-unum-ler.mjs [saida.json]
import fs from 'node:fs';

export const RPCS = ['https://base-rpc.publicnode.com', 'https://mainnet.base.org', 'https://base.gateway.tenderly.co'];
export const CARTEIRA = '0x4a10ca6085703425a92bf7df390dd7869858b846'; // "@organismo" nas capturas de Unum; classificada interna
export const MOEDAS = [
  { nome_dito: 'VALIUM', contrato: '0x37f70bccdc2125346a7542fe6e7fc70e33421635' },
  { nome_dito: 'PRESENÇA', contrato: '0x120a1ba3b10263f9cb42e971598c860d66b68cea' },
  { nome_dito: '4SUE', contrato: '0x69b35d06eccded875f572285d8a3c2b3cd303835' },
  { nome_dito: 'Marsisnotthere', contrato: '0xae4c774c4b079b22cce2ef3256a367c5ed4bff27' },
  { nome_dito: 'Good reason', contrato: '0xd0b65efc56a7eba86a89d79eb585d0a6a0fc6d01' },
];

const str = (h) => { if (!h || !h.startsWith('0x')) return null; const b = Buffer.from(h.slice(2), 'hex'); if (b.length < 64) return null; const n = Number(BigInt('0x' + b.subarray(32, 64).toString('hex'))); return b.subarray(64, 64 + n).toString('utf8'); };
async function rpc(url, method, params) {
  try { const j = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15000) })).json(); return j.result ?? null; } catch { return null; }
}
// devolve { valor, fontes } só com acordo de pelo menos duas fontes; senão { valor: null, fontes: <quantas responderam> }
async function acordo(method, params, tratar = (x) => x) {
  const rs = (await Promise.all(RPCS.map((u) => rpc(u, method, params)))).map((x) => (x == null ? null : tratar(x)));
  const ok = rs.filter((x) => x != null); const v = ok[0];
  return ok.length >= 2 && ok.every((x) => x === v) ? { valor: v, fontes: ok.length } : { valor: null, fontes: ok.length };
}
const call = (to, data) => ['eth_call', [{ to, data }, 'latest']];

export async function lerMoeda(m) {
  const lido = {}, nao = [];
  const campos = { name: ['0x06fdde03', str], symbol: ['0x95d89b41', str], decimals: ['0x313ce567', (h) => Number(BigInt(h))], total_supply_raw: ['0x18160ddd', (h) => BigInt(h).toString()], contract_uri: ['0xe8a3d485', str] };
  for (const [k, [sel, f]] of Object.entries(campos)) { const r = await acordo(...call(m.contrato, sel), f); if (r.valor == null) nao.push(`${k}: sem acordo de duas fontes`); else lido[k] = r.valor; }
  const cod = await acordo('eth_getCode', [m.contrato, 'latest'], (h) => (h.length - 2) / 2 + ':' + h.slice(0, 22) + ':' + h.slice(22, 62));
  if (cod.valor) { const [n, pre, impl] = cod.valor.split(':'); lido.bytecode = { bytes: Number(n), tipo: pre === '0x363d3d373d3d3d363d73' && Number(n) === 45 ? 'clone mínimo EIP-1167' : 'outro', implementacao: Number(n) === 45 ? '0x' + impl : null }; } else nao.push('bytecode: sem acordo de duas fontes');
  const sal = await acordo(...call(m.contrato, '0x70a08231' + CARTEIRA.slice(2).padStart(64, '0')), (h) => BigInt(h).toString());
  if (sal.valor == null) nao.push('saldo da carteira: sem acordo de duas fontes'); else lido.saldo_da_carteira_raw = sal.valor;
  let metadados = null;
  if (lido.contract_uri?.startsWith('https://')) { try { const j = await (await fetch(lido.contract_uri, { signal: AbortSignal.timeout(15000) })).json(); metadados = { name: j.name ?? null, description: j.description ?? null, fonte: 'uma só (HTTP), não verificada' }; } catch { nao.push('conteúdo do contractURI: não lido'); } }
  return { nome_dito_por_unum: m.nome_dito, contrato: m.contrato, autoria: 'palavra de Unum (sessão de 01/11/2026); a cadeia lida aqui não a prova', lido, metadados_do_uri: metadados, nao_verificado: nao };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const moedas = []; for (const m of MOEDAS) moedas.push(await lerMoeda(m));
  const out = {
    schema: 'orum-moedas-de-unum/v1', rede: { nome: 'Base', chain_id: 8453 }, lido_em_utc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    palavra_de_unum: 'Eu criei estes tokens ORA / sim criei (01/11/2026, na sessão de trabalho, com capturas da app da carteira); Marsisnotthere e Good reason com os endereços por ele dados', carteira_lida: CARTEIRA,
    carteira_nota: 'carteira "@organismo" das capturas de Unum: os saldos de VALIUM, PRESENÇA e 4SUE lidos na cadeia coincidem com os das capturas; classificada interna em ora_carteiras_classificacao',
    fontes_rpc: RPCS, moedas,
    nao_verificado: ['quem criou cada contrato (a autoria é palavra de Unum)', 'payoutRecipient e owner de cada moeda', 'preço, liquidez, procura, detentores', 'o 0001sensations / VALIUM na BNB (endereço não dado)', 'os valores em dólares da app'],
    nao_afirma: ['preço', 'liquidez', 'procura', 'receita', 'lastro', 'rendimento'],
    truth_machine: { move_fundos: false, escreve_na_cadeia: false, promete_receita: false, prova_autoria: false, classifica: false },
    verificador: 'npm run moedas-unum:verify',
  };
  const dest = process.argv[2] ?? 'token/moedas-de-unum-2026-11-01.json';
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n'); console.log(dest, moedas.map((m) => `${m.nome_dito_por_unum}: ${m.lido.name ?? '?'} / ${m.lido.symbol ?? '?'} / saldo ${m.lido.saldo_da_carteira_raw ?? '?'} / nao:${m.nao_verificado.length}`).join('\n'));
}
