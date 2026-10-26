import assert from 'node:assert/strict';
import fs from 'node:fs';
import { conferirBlocos } from '../kit/blocos.mjs';

// Valores lidos a 19/10/2026 em blockstream.info e mempool.space (públicos).
const BLOCOS = {
  972115: { id: '0000000000000000000046931113f06e323bb12cfb74ade544cac844df0523c5', merkle_root: 'fc1f7a070be781a2e50ec075203c6a48dbd0e9a5d44737b1a86faf29ba8d3dee', timestamp: 1792393108 },
  972151: { id: '000000000000000000016dd0c2a998c75bfd8a61120d842f64f87753671db5db', merkle_root: '620394876030288eeb94303364541eb6f5ec3ac8cc4980c248458efb14febd82', timestamp: 1792416143 },
  972155: { id: '000000000000000000002b01d09dbee0a115f4e22374fd9b8862edc7e89df4de', merkle_root: '389191322d961795e8d2ef9b0c039ad1e8dde7ae91b6c72e87b740e1dbc3ff13', timestamp: 1792416998 },
  // lido a 20/10/2026 em blockstream.info e mempool.space (iguais nas duas)
  972195: { id: '00000000000000000001389393772fa88ecff4d3337a25a27c14d0f73d03142b', merkle_root: '256fbf81020970f83d53f2b9f6ae801f89a76fd9e6d9c087acf99292691223ad', timestamp: 1792436861 },
  // camada 2 da raiz, lido a 20/10/2026 em blockstream.info e mempool.space (iguais nas duas)
  972280: { id: '00000000000000000000c949594dcb1461a22989276eb416fd98c87612980131', merkle_root: '8eaa08292167f3e968fab3c8b6bd61a49723e5ea22061c9edc037fae993a096b', timestamp: 1792480671 },
  972285: { id: '00000000000000000001eb9dc3d53c485b2a0167a77c7bf499e8f7fb6abba6ca', merkle_root: '522b721ef2519fc354d17809865a6a5973bfd4d5f811cca55d5a7deaf8135b55', timestamp: 1792481245 },
  972300: { id: '00000000000000000001d7ede178227454eb3e19f2fcdf98a3bea869f245e617', merkle_root: '8dcabd691e22d7bd41b950ca7ebe34ea33b555c0dcb1e1686fc1bf28584a61d3', timestamp: 1792487646 },
  // Lidos a 26/10/2026 em blockstream.info e mempool.space (as duas fontes concordam): blocos das camadas 9 e 10 da raiz.
  973223: { id: '000000000000000000010c4c42514fb8c0aeaa2f2cfff343ea8cdffb28a81980', merkle_root: 'a9d346e5bff1ff5a5bf2c488eed81625b47e4e1eb32946205d4f2950e2199f8b', timestamp: 1793008228 },
  973225: { id: '000000000000000000019b9084d244069880afdc08e343d047efd5a9eb263aee', merkle_root: 'f9d46fdb0b67764808898108063dad32c5ff3c921a552dcae79aa82c6bf90f43', timestamp: 1793010123 },
};
const recibos = { oro: fs.readFileSync('ancora/oro-v1.ots'), raiz: fs.readFileSync('ancora/raiz-registos.ots'), raiz2: fs.readFileSync('ancora/raiz-registos-2.ots'), raiz9: fs.readFileSync('ancora/raiz-registos-9.ots'), raiz10: fs.readFileSync('ancora/raiz-registos-10.ots') };

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
assert.equal(ok1.length, 3);
assert.deepEqual(ok2.map((b) => b.altura), [972151, 972155, 972195]);
const ok3 = await conferirBlocos(recibos.raiz2, { fetcher: fetcherCom() });
assert.deepEqual(ok3.map((b) => b.altura), [972280, 972285, 972300]);
const ok9 = await conferirBlocos(recibos.raiz9, { fetcher: fetcherCom() });
assert.deepEqual(ok9.map((b) => b.altura), [973223]);
const ok10 = await conferirBlocos(recibos.raiz10, { fetcher: fetcherCom() });
assert.deepEqual(ok10.map((b) => b.altura), [973225]);
console.log(`Blocos conferidos com duas fontes: ${ok1.length + ok2.length + ok3.length + ok9.length + ok10.length} atestações.`);

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
