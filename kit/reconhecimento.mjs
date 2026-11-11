// Reconhece, sem a ORA, se um endereço detém PRESENÇA ou VALIUM na Base, segundo token/reconhecimento.json.
// "Detém" = saldo maior que zero, lido no mesmo bloco em pelo menos duas fontes RPC públicas que concordam.
// Reconhecer não é pagar, não dá direitos, não tem preço e não prova procura. Só leitura (eth_call).
// Precisa de rede (Node 18+, fetch). Uso: node kit/reconhecimento.mjs <endereço> [registo.json]
// Sai com 0 se o resultado é conclusivo (detém ou não detém), 1 se inconclusivo, 2 se o endereço é inválido.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FONTES, fetcherReal } from './sedimento.mjs';

export { FONTES, fetcherReal };
const ENDERECO = /^0x[0-9a-fA-F]{40}$/;
const ZERO = '0x0000000000000000000000000000000000000000';

export function enderecoValido(a) {
  return typeof a === 'string' && ENDERECO.test(a) && a.toLowerCase() !== ZERO;
}

async function rpc(fetcher, url, method, params) {
  const r = await fetcher(url, { jsonrpc: '2.0', id: 1, method, params });
  if (r.error) throw new Error(`${method}: ${JSON.stringify(r.error).slice(0, 80)}`);
  return r.result;
}

// Resultado: { estado: 'detem' | 'nao_detem' | 'inconclusivo' | 'endereco_invalido', bloco, fontes, falharam, por_token }
// `por_token[].saldo_raw` só é preenchido quando as fontes concordam nesse token.
export async function reconhecer(endereco, registo, { fetcher, fontes = FONTES } = {}) {
  if (!enderecoValido(endereco)) return { estado: 'endereco_invalido', endereco, por_token: [], fontes: [], falharam: [] };
  const nomes = registo.fontes_rpc.filter((n) => fontes[n]);
  const falharam = [];
  const cabecas = {};
  for (const n of nomes) {
    try { cabecas[n] = parseInt(await rpc(fetcher, fontes[n], 'eth_blockNumber', []), 16); } catch (e) { falharam.push(`${n}: ${e.message}`); }
  }
  const vivas = nomes.filter((n) => cabecas[n] !== undefined);
  if (vivas.length < 2) return { estado: 'inconclusivo', motivo: 'menos de duas fontes responderam', endereco, por_token: [], fontes: vivas, falharam };
  const bloco = '0x' + (Math.min(...vivas.map((n) => cabecas[n])) - 10).toString(16);
  const palavra = endereco.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const leituras = {};
  const leram = [];
  for (const n of vivas) {
    try {
      const l = {};
      for (const t of registo.tokens) l[t.nome] = BigInt(await rpc(fetcher, fontes[n], 'eth_call', [{ to: t.contrato, data: '0x70a08231' + palavra }, bloco])).toString();
      leituras[n] = l;
      leram.push(n);
    } catch (e) { falharam.push(`${n}: ${e.message}`); }
  }
  if (leram.length < 2) return { estado: 'inconclusivo', motivo: 'menos de duas fontes leram tudo', endereco, bloco: parseInt(bloco, 16), por_token: [], fontes: leram, falharam };
  const por_token = registo.tokens.map((t) => {
    const valores = new Set(leram.map((n) => leituras[n][t.nome]));
    if (valores.size !== 1) return { nome: t.nome, contrato: t.contrato, concordam: false, detem: null, saldo_raw: null };
    const raw = [...valores][0];
    return { nome: t.nome, contrato: t.contrato, concordam: true, detem: BigInt(raw) > 0n, saldo_raw: raw };
  });
  const bloco_n = parseInt(bloco, 16);
  // Uma discordância em qualquer token torna o conjunto inconclusivo: não se reconhece com uma fonte contra a outra.
  if (por_token.some((p) => !p.concordam)) return { estado: 'inconclusivo', motivo: 'as fontes discordam', endereco, bloco: bloco_n, por_token, fontes: leram, falharam };
  return { estado: por_token.some((p) => p.detem) ? 'detem' : 'nao_detem', endereco, bloco: bloco_n, por_token, fontes: leram, falharam };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const endereco = process.argv[2];
  const caminho = process.argv[3] || new URL('../token/reconhecimento.json', import.meta.url);
  const registo = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  const r = await reconhecer(endereco, registo, { fetcher: fetcherReal });
  if (r.estado === 'endereco_invalido') { console.log('endereço inválido (0x + 40 hex, não zero)'); process.exit(2); }
  console.log(`estado: ${r.estado}${r.motivo ? ' (' + r.motivo + ')' : ''}${r.bloco ? '; bloco ' + r.bloco : ''}; fontes: ${r.fontes.join(', ') || '-'}${r.falharam.length ? '; falharam: ' + r.falharam.join(' | ') : ''}`);
  for (const p of r.por_token) console.log(`  ${p.nome}: ${p.concordam ? (p.detem ? 'detém' : 'não detém') : 'fontes discordam'}`);
  console.log('reconhecer não é pagar, não dá direitos, não tem preço e não prova procura');
  process.exit(r.estado === 'inconclusivo' ? 1 : 0);
}
