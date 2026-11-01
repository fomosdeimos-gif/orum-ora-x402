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
  // Lidos a 27/10/2026 em blockstream.info e mempool.space (as duas fontes concordam): blocos das camadas 11 e 12 da raiz.
  973289: { id: '00000000000000000000b308cb6c909b3f07101aee206dcac0ac4559f12f0dcd', merkle_root: '7bad59cf954b310d712fa9fe378a98b9fce44822cf58caabb401522aed429b39', timestamp: 1793048303 },
  973290: { id: '00000000000000000000bc496f8c5ba389238703ac8a37e9d4dd8599bda84c6a', merkle_root: 'babf514ae8e1bc6952fc0759771a7025d3bfd7945983cb1d27c957b882852c70', timestamp: 1793048683 },
  973294: { id: '000000000000000000016bf2a1c9edfec9df5de9c42bf933b6b279093629cb96', merkle_root: 'd6d7ebc9e32fbb64c165e2975e85db83c08c9fba0fc643fef6f582d795b956b6', timestamp: 1793049370 },
  // Lidos a 27/10/2026 em blockstream.info e mempool.space (as duas fontes concordam): blocos da camada 13 da raiz.
  973405: { id: '000000000000000000016b531642c88ca93f5e738a006ae7fe57e1e0b1c585ff', merkle_root: 'cd6ef034676ddb868b4068b91be26ec0680cc21bed68735162319d3fe5ec56bb', timestamp: 1793108866 },
  973414: { id: '0000000000000000000016af3ec01142486cfa237730bdc636e020dbc58f9191', merkle_root: 'd1f1073ba42b59b5ee916d54e5c72741cf9c0a15d172cf3c0462d2c43ab5d29e', timestamp: 1793114052 },
  973423: { id: '00000000000000000001dbc40e0eedd2f0dd80d6c69d048957305b27b4e95d55', merkle_root: '585a9f6411812ce9ba12d3d3c52d2184f9f5d380ee36e83c808db96f01385a2c', timestamp: 1793118244 },
  // Lidos a 31/10/2026 em blockstream.info e mempool.space (as duas fontes concordam): blocos da camada 14 da raiz.
  973675: { id: '0000000000000000000161813df7e2ded4147ec6f1958682f26ccccca5403c2a', merkle_root: 'bb0604006b7e5a0951d6f9c031b1a63dd67ac3359f9f018e56d37f7604192abd', timestamp: 1793268339 },
  973676: { id: '00000000000000000000c65263f2fdb8fb98257c13095450c377a7ca389c277c', merkle_root: '4a6543a701946edc7ea423a6c8655f4e1236e148d9e7e749da9b5ea71ebbf1f8', timestamp: 1793268212 },
  973699: { id: '000000000000000000014d97ed23ee35ac6a9073a8d81f5ce23960280931f371', merkle_root: '2581ad5ffbdc3fde9c32067b1a20c645edd0883a3a8d48523c01505ac9d91118', timestamp: 1793284074 },
  // Lidos a 31/10/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco da camada 15 da raiz.
  973948: { id: '000000000000000000009a9788cfb3839541555234ee54dd61acec05d4018bd5', merkle_root: '2a74ed7cdf4f8995623ab79cda267c12144104c3b542314d5582045f2693c407', timestamp: 1793432868 },
  // Lidos a 01/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco da camada 16 da raiz.
  974024: { id: '00000000000000000001cb03a210c17493242bdb4e076c7fc006c4f7a9bc3318', merkle_root: 'c6fdf138a138a06f2d6b9e934373fa7807b30a5dad9a5a8f8e74e66ca7250d0e', timestamp: 1793479769 },
  // Lido a 01/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco da finney para a camada 16.
  974047: { id: '00000000000000000001a14e879ad2930637e12a80013e7f311b6a7d1003ec50', merkle_root: '49c3eac26fc45f6a772482863eee7037c831606a97781aed6fe450563227a42f', timestamp: 1793493761 },
  // Lido a 01/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco da camada 17 da raiz.
  974107: { id: '0000000000000000000153c5328a52bbef4d4983284ca8afe746bb7733a13dfe', merkle_root: '737b764d75450fc1ab3b0bce93c54d9feb21e65deb5f4d0ce6b7d637e5fa56ea', timestamp: 1793523051 },
  // Lido a 01/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco da camada 18 da raiz.
  974120: { id: '000000000000000000017e5023e68eada5c58844f8f787d68c5a279f31311231', merkle_root: 'edcc20b1198ff7021b9d3adc0e8a0c0e8873395626e343afe3c76bbb5f5e9444', timestamp: 1793531941 },
};
const recibos = { oro: fs.readFileSync('ancora/oro-v1.ots'), raiz: fs.readFileSync('ancora/raiz-registos.ots'), raiz2: fs.readFileSync('ancora/raiz-registos-2.ots'), raiz9: fs.readFileSync('ancora/raiz-registos-9.ots'), raiz10: fs.readFileSync('ancora/raiz-registos-10.ots'), raiz11: fs.readFileSync('ancora/raiz-registos-11.ots'), raiz12: fs.readFileSync('ancora/raiz-registos-12.ots'), raiz13: fs.readFileSync('ancora/raiz-registos-13.ots'), raiz14: fs.readFileSync('ancora/raiz-registos-14.ots'), raiz15: fs.readFileSync('ancora/raiz-registos-15.ots'), raiz16: fs.readFileSync('ancora/raiz-registos-16.ots'), raiz17: fs.readFileSync('ancora/raiz-registos-17.ots'), raiz18: fs.readFileSync('ancora/raiz-registos-18.ots') };

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
const ok11 = await conferirBlocos(recibos.raiz11, { fetcher: fetcherCom() });
assert.deepEqual(ok11.map((b) => b.altura), [973289, 973294]);
const ok12 = await conferirBlocos(recibos.raiz12, { fetcher: fetcherCom() });
assert.deepEqual(ok12.map((b) => b.altura), [973290, 973294]);
const ok13 = await conferirBlocos(recibos.raiz13, { fetcher: fetcherCom() });
assert.deepEqual(ok13.map((b) => b.altura), [973423, 973405, 973414]);
const ok14 = await conferirBlocos(recibos.raiz14, { fetcher: fetcherCom() });
assert.deepEqual(ok14.map((b) => b.altura), [973675, 973676, 973699]);
const ok15 = await conferirBlocos(recibos.raiz15, { fetcher: fetcherCom() });
assert.deepEqual(ok15.map((b) => b.altura), [973948, 973948]);
const ok16 = await conferirBlocos(recibos.raiz16, { fetcher: fetcherCom() });
assert.deepEqual(ok16.map((b) => b.altura), [974024, 974024, 974047]);
const ok17 = await conferirBlocos(recibos.raiz17, { fetcher: fetcherCom() });
assert.deepEqual(ok17.map((b) => b.altura), [974107, 974107]);
const ok18 = await conferirBlocos(recibos.raiz18, { fetcher: fetcherCom() });
assert.deepEqual(ok18.map((b) => b.altura), [974120, 974120]);
console.log(`Blocos conferidos com duas fontes: ${ok1.length + ok2.length + ok3.length + ok9.length + ok10.length + ok11.length + ok12.length + ok13.length + ok14.length + ok15.length + ok16.length + ok17.length + ok18.length} atestações.`);

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
