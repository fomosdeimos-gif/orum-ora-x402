// Arquiva no Wayback Machine as URLs públicas das âncoras e do kit, e confere o que ficou guardado.
// Só URLs públicas do domínio do gateway; nenhum segredo, nenhum nome. Precisa de rede (Node 18+).
// Uso: node scripts/arquivar-wayback.mjs   (imprime JSON; sai com 1 se algum alvo não ficou igual)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = 'https://ora-x402-gateway.vercel.app';
export const ALVOS = [
  'ancora/oro-v1.json', 'ancora/oro-v1.ots', 'ancora/raiz-registos.json', 'ancora/raiz-registos.ots',
  'kit/LEIA-ME.txt', 'kit/verificar.mjs', 'kit/blocos.mjs', 'kit/raiz.mjs',
];
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// fetcher(url) devolve { status, bytes }. Injectável para testar sem rede.
// `esperado(alvo)` devolve os bytes que o arquivo deve guardar (por omissão, o ficheiro do repositório em `raiz`;
// com ORUM_ESPERADO=vivo, o que o domínio serve nesse momento, para correr onde o repositório não está).
export async function arquivar({ fetcher, raiz, esperado = async (alvo) => fs.readFileSync(path.join(raiz, alvo)), alvos = ALVOS, pausaMs = 0, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const resultados = [];
  for (const alvo of alvos) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(alvo) || alvo.includes('..')) throw new Error(`alvo inválido: ${alvo}`);
    const url = `${BASE}/${alvo}`;
    const r = { alvo, url, sha256_local: sha(await esperado(alvo)), igual: false };
    try {
      const guardar = await fetcher(`https://web.archive.org/save/${url}`);
      r.save_http = guardar.status;
      const disp = await fetcher(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
      const snap = JSON.parse(Buffer.from(disp.bytes).toString('utf8'))?.archived_snapshots?.closest;
      if (!snap?.available || String(snap.status) !== '200' || !/^\d{14}$/.test(snap.timestamp ?? '')) throw new Error('sem snapshot 200');
      r.timestamp = snap.timestamp;
      r.snapshot = `https://web.archive.org/web/${snap.timestamp}id_/${url}`;
      const cru = await fetcher(r.snapshot);
      if (cru.status !== 200) throw new Error(`snapshot cru HTTP ${cru.status}`);
      r.sha256_arquivo = sha(cru.bytes);
      r.igual = r.sha256_arquivo === r.sha256_local;
      if (!r.igual) r.erro = 'o que o arquivo guarda não tem o sha256 do ficheiro do repositório';
    } catch (e) {
      r.erro = String(e.message).slice(0, 160);
    }
    resultados.push(r);
    if (pausaMs) await dormir(pausaMs);
  }
  return { ok: resultados.every((x) => x.igual), resultados };
}

const fetcherReal = async (url) => {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
  return { status: r.status, bytes: new Uint8Array(await r.arrayBuffer()) };
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const vivo = process.env.ORUM_ESPERADO === 'vivo';
  const esperado = vivo ? async (alvo) => (await fetcherReal(`${BASE}/${alvo}`)).bytes : undefined;
  const saida = await arquivar({ fetcher: fetcherReal, raiz, esperado, pausaMs: 6000 });
  console.log(JSON.stringify({ lido_em_utc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), ...saida }));
  if (!saida.ok) process.exit(1);
}
