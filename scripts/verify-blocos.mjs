import assert from 'node:assert/strict';
import fs from 'node:fs';
import { conferirBlocos } from '../kit/blocos.mjs';

// Valores lidos a 19/10/2026 em blockstream.info e mempool.space (públicos).
const BLOCOS = {
  972115: { id: '0000000000000000000046931113f06e323bb12cfb74ade544cac844df0523c5', merkle_root: 'fc1f7a070be781a2e50ec075203c6a48dbd0e9a5d44737b1a86faf29ba8d3dee', timestamp: 1792393108 },
  972151: { id: '000000000000000000016dd0c2a998c75bfd8a61120d842f64f87753671db5db', merkle_root: '620394876030288eeb94303364541eb6f5ec3ac8cc4980c248458efb14febd82', timestamp: 1792416143 },
  972155: { id: '000000000000000000002b01d09dbee0a115f4e22374fd9b8862edc7e89df4de', merkle_root: '389191322d961795e8d2ef9b0c039ad1e8dde7ae91b6c72e87b740e1dbc3ff13', timestamp: 1792416998 },
};
const recibos = { oro: fs.readFileSync('ancora/oro-v1.ots'), raiz: fs.readFileSync('ancora/raiz-registos.ots') };

// fetcher simulado; `mut` permite estragar uma das fontes.
function fetcherCom(mut = {}) {
  return async (url, json) => {
    const fonte = url.includes('blockstream') ? 'blockstream' : 'mempool';
    const m = url.match(/block-height\/(\d+)/);
    if (m) {
      const h = Number(m[1]);
      return (mut[fonte]?.hash?.(h) ?? BLOCOS[h].id);
    }
    const hash = url.split('/block/')[1];
    const alt = Object.keys(BLOCOS).find((h) => BLOCOS[h].id === hash) ?? Object.keys(BLOCOS).find((h) => hash === mut[fonte]?.hash?.(Number(h)));
    const b = BLOCOS[alt] ?? BLOCOS[972115];
    const base = { id: hash, height: Number(alt ?? 972115), merkle_root: b.merkle_root, timestamp: b.timestamp };
    return json ? { ...base, ...(mut[fonte]?.bloco?.(base) ?? {}) } : '';
  };
}

const ok1 = await conferirBlocos(recibos.oro, { fetcher: fetcherCom() });
const ok2 = await conferirBlocos(recibos.raiz, { fetcher: fetcherCom() });
assert.equal(ok1.length, 2);
assert.deepEqual(ok2.map((b) => b.altura), [972151, 972155]);
console.log(`Blocos conferidos com duas fontes: ${ok1.length + ok2.length} atestações.`);

const rejeita = async (nome, fn) => { await assert.rejects(fn, undefined, `estrago não apanhado: ${nome}`); };
await rejeita('raiz de Merkle de uma fonte alterada', () => conferirBlocos(recibos.oro, { fetcher: fetcherCom({ mempool: { bloco: () => ({ merkle_root: '0'.repeat(64) }) } }) }));
await rejeita('as duas fontes com a mesma raiz errada', () => conferirBlocos(recibos.oro, { fetcher: fetcherCom({ mempool: { bloco: () => ({ merkle_root: 'a'.repeat(64) }) }, blockstream: { bloco: () => ({ merkle_root: 'a'.repeat(64) }) } }) }));
await rejeita('raiz em ordem de exploração, sem inverter, tomada por igual', () => conferirBlocos(recibos.oro, { fetcher: fetcherCom({ mempool: { bloco: (b) => ({ merkle_root: Buffer.from(b.merkle_root, 'hex').reverse().toString('hex') }) }, blockstream: { bloco: (b) => ({ merkle_root: Buffer.from(b.merkle_root, 'hex').reverse().toString('hex') }) } }) }));
await rejeita('fontes discordam do hash', () => conferirBlocos(recibos.oro, { fetcher: fetcherCom({ mempool: { hash: () => 'f'.repeat(64) } }) }));
await rejeita('bloco com altura diferente', () => conferirBlocos(recibos.oro, { fetcher: fetcherCom({ blockstream: { bloco: () => ({ height: 1 }) } }) }));
await rejeita('bloco com id diferente do pedido', () => conferirBlocos(recibos.oro, { fetcher: fetcherCom({ blockstream: { bloco: () => ({ id: 'b'.repeat(64) }) } }) }));
await rejeita('hash de bloco inválido', () => conferirBlocos(recibos.oro, { fetcher: fetcherCom({ blockstream: { hash: () => 'não-é-hash' } }) }));
await rejeita('recibo cortado a meio (sem atestação completa)', () => conferirBlocos(fs.readFileSync('ancora/oro-v1.ots').subarray(0, 635), { fetcher: fetcherCom() }));
await rejeita('recibo truncado', () => conferirBlocos(recibos.oro.subarray(0, 300), { fetcher: fetcherCom() }));
console.log('Estragos propositados apanhados: 9.');
