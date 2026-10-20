import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { arquivar, ALVOS, BASE } from './arquivar-wayback.mjs';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const raiz = process.cwd();
const TS = '20261020120000';
const local = (alvo) => fs.readFileSync(`${raiz}/${alvo}`);

// Fetcher simulado de um arquivo que guarda exactamente o que o repositório tem; `mut` estraga uma peça.
function fetcherCom(mut = {}) {
  return async (url) => {
    if (url.startsWith('https://web.archive.org/save/')) return mut.save?.(url) ?? { status: 200, bytes: new Uint8Array() };
    if (url.startsWith('https://archive.org/wayback/available')) {
      const alvo = decodeURIComponent(url.split('url=')[1]).replace(`${BASE}/`, '');
      const corpo = mut.disponivel?.(alvo) ?? { archived_snapshots: { closest: { available: true, status: '200', timestamp: TS, url: 'x' } } };
      return { status: 200, bytes: Buffer.from(JSON.stringify(corpo)) };
    }
    const alvo = url.split('id_/')[1].replace(`${BASE}/`, '');
    return mut.cru?.(alvo, local(alvo)) ?? { status: 200, bytes: local(alvo) };
  };
}

const bom = await arquivar({ fetcher: fetcherCom(), raiz });
assert.equal(bom.ok, true);
assert.equal(bom.resultados.length, ALVOS.length);
assert.ok(bom.resultados.every((r) => r.snapshot.includes(`/web/${TS}id_/`) && r.sha256_arquivo === r.sha256_local));
console.log(`Arquivo simulado conferido: ${bom.resultados.length} alvos.`);

const falha = async (nome, mut, alvos) => {
  const r = await arquivar({ fetcher: fetcherCom(mut), raiz, alvos });
  assert.equal(r.ok, false, `estrago não apanhado: ${nome}`);
};
await falha('arquivo guarda bytes alterados', { cru: (a, b) => ({ status: 200, bytes: Buffer.concat([b, Buffer.from('x')]) }) });
await falha('recibo .ots truncado no arquivo', { cru: (a, b) => ({ status: 200, bytes: b.subarray(0, b.length - 1) }) }, ['ancora/oro-v1.ots']);
await falha('sem snapshot disponível', { disponivel: () => ({ archived_snapshots: {} }) });
await falha('snapshot com estado 404', { disponivel: () => ({ archived_snapshots: { closest: { available: true, status: '404', timestamp: TS } } }) });
await falha('timestamp inválido', { disponivel: () => ({ archived_snapshots: { closest: { available: true, status: '200', timestamp: 'ontem' } } }) });
await falha('snapshot cru devolve 404', { cru: () => ({ status: 404, bytes: new Uint8Array() }) });
await falha('só um alvo falha entre vários', { cru: (a, b) => (a === 'kit/raiz.mjs' ? { status: 200, bytes: Buffer.from('outro') } : { status: 200, bytes: b }) });
await assert.rejects(() => arquivar({ fetcher: fetcherCom(), raiz, alvos: ['../CLAUDE.md'] }), /alvo inválido/);
await assert.rejects(() => arquivar({ fetcher: fetcherCom(), raiz, alvos: ['/etc/passwd'] }), /alvo inválido/);
console.log('Estragos propositados apanhados: 9.');

// O registo guardado (se existir) tem de ser coerente: nada marcado igual sem os dois hashes iguais.
if (fs.existsSync('ancora/arquivos-wayback.json')) {
  const reg = JSON.parse(fs.readFileSync('ancora/arquivos-wayback.json', 'utf8'));
  for (const r of reg.resultados) {
    assert.ok(r.url.startsWith(`${BASE}/`), `url fora do domínio: ${r.url}`);
    if (r.igual) {
      assert.ok(/^[0-9a-f]{64}$/.test(r.sha256_arquivo) && r.sha256_arquivo === r.sha256_local, `registo incoerente: ${r.alvo}`);
      assert.ok(r.snapshot === `https://web.archive.org/web/${r.timestamp}id_/${r.url}`, `snapshot incoerente: ${r.alvo}`);
    }
  }
  console.log(`Registo ancora/arquivos-wayback.json coerente: ${reg.resultados.filter((r) => r.igual).length}/${reg.resultados.length} iguais.`);
}
