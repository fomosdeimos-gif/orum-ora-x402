// Confere as atestações Bitcoin dos recibos contra o cabeçalho real, em duas fontes independentes.
// Precisa de rede (Node 18+, fetch). Uso: node kit/blocos.mjs [recibo.ots ...]
// Por omissão confere ancora/oro-v1.ots e ancora/raiz-registos.ots.
// O que compara: a raiz de Merkle que a atestação diz que o bloco contém (bytes internos) com o
// merkle_root do bloco, que os exploradores mostram em ordem inversa.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerRecibo } from '../scripts/lib/ots.mjs';

export const FONTES = { blockstream: 'https://blockstream.info/api', mempool: 'https://mempool.space/api' };
const inverter = (hex) => Buffer.from(hex, 'hex').reverse().toString('hex');

// fetcher(url) devolve { texto } ou { json }; injectável para testar sem rede.
export async function conferirBlocos(reciboBytes, { fetcher, fontes = FONTES } = {}) {
  const recibo = lerRecibo(reciboBytes);
  const btc = recibo.atestacoes.filter((a) => a.tipo === 'bitcoin');
  if (!btc.length) throw new Error('o recibo não tem atestação Bitcoin');
  const saida = [];
  for (const a of btc) {
    const esperado = a.raiz_a_comparar_com_o_bloco;
    const lido = {};
    for (const [nome, base] of Object.entries(fontes)) {
      const hash = String(await fetcher(`${base}/block-height/${a.altura}`)).trim();
      if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`${nome}: hash de bloco inválido para a altura ${a.altura}`);
      const b = await fetcher(`${base}/block/${hash}`, true);
      if (b.height !== a.altura) throw new Error(`${nome}: o bloco devolvido não tem a altura ${a.altura}`);
      if (b.id !== hash) throw new Error(`${nome}: o bloco devolvido não é o do hash pedido`);
      lido[nome] = { hash, merkle_root: b.merkle_root, timestamp: b.timestamp };
    }
    const fontesLidas = Object.values(lido);
    if (new Set(fontesLidas.map((f) => f.hash)).size !== 1) throw new Error(`as fontes discordam do hash do bloco ${a.altura}`);
    if (new Set(fontesLidas.map((f) => f.merkle_root)).size !== 1) throw new Error(`as fontes discordam da raiz de Merkle do bloco ${a.altura}`);
    if (inverter(fontesLidas[0].merkle_root) !== esperado) throw new Error(`a atestação do bloco ${a.altura} não bate com a raiz de Merkle do cabeçalho`);
    saida.push({ altura: a.altura, hash: fontesLidas[0].hash, merkle_root: fontesLidas[0].merkle_root, timestamp: fontesLidas[0].timestamp, fontes: Object.keys(lido) });
  }
  return saida;
}

const fetcherReal = async (url, json = false) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return json ? r.json() : r.text();
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const aqui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const recibos = process.argv.slice(2).length ? process.argv.slice(2) : ['ancora/oro-v1.ots', 'ancora/raiz-registos.ots'];
  let falhou = false;
  for (const f of recibos) {
    try {
      const r = await conferirBlocos(fs.readFileSync(path.resolve(aqui, f)), { fetcher: fetcherReal });
      for (const b of r) console.log(`OK  ${f}: bloco ${b.altura} (${new Date(b.timestamp * 1000).toISOString()}) ${b.hash.slice(0, 20)}… raiz de Merkle igual à da atestação, em ${b.fontes.join(' e ')}`);
    } catch (e) {
      falhou = true;
      console.error(`FALHA  ${f}: ${e.message}`);
    }
  }
  if (falhou) process.exit(1);
}
