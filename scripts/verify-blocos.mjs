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
  // Lido a 01/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco da camada 19 da raiz.
  974134: { id: '000000000000000000006608e30a841e01ab0e22cf40f9d7e57c845e4b4d79e9', merkle_root: 'e953482b197143773e5cd978841a6aaaa9d61eefd4688c1b31d12a44b30f8898', timestamp: 1793542910 },
  // Lido a 01/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco da camada 20 da raiz.
  974139: { id: '000000000000000000004a0fe6e115c1dd2efbe70140f19d8feaaf51682ad4d9', merkle_root: '444da72e1f98978ad4f63f940e42ea700a56feea996f09bd7659fe5b749f0da3', timestamp: 1793546614 },
  // Lido a 01/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco da camada 21 da raiz.
  // Lido a 01/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco da camada 22 da raiz.
  // Lido a 02/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco 974194 (camadas 23 e 24 da raiz).
  974194: { id: '00000000000000000000b6ac3dab32b1422a4f5c1480e32df4f914ab7c64e756', merkle_root: 'c3e319e3d10c9333e761dfcff9c0a5110565c2d5696df5750b107598578fb481', timestamp: 1793579964 },
  // Lido a 02/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco 974195 (camadas 25 da raiz).
  974195: { id: '000000000000000000018381436f5efccc2f0cb8ca87c58e081b6217b1463bbe', merkle_root: '3f33892c33decde2afd972ba4ab36da565d5999c56bbfd2278cd284491fa6969', timestamp: 1793580831 },
  // Lido a 02/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco 974230 (camada 26 da raiz).
  974230: { id: '000000000000000000003a5f85981806a7f5352c6a7f35f16e3d90a1a3008bca', merkle_root: '1b239ab0a9a61be69e1ba5741e21001213da207d97820e0610c4697c50ffdd60', timestamp: 1793605842 },
  // Lido a 02/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco 974236 (camada 27 da raiz).
  974236: { id: '000000000000000000007986b2f2c94d1470c99dab8e01ea1265294f7e8dd9bf', merkle_root: '991820b064fcc2e0f6a9827616a3a2aeb6dacd23404a205d082d7131393537bb', timestamp: 1793611236 },
  // Lido a 02/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco 974245 (camada 28 da raiz).
  // Lido a 02/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): blocos 974255 e 974257 (camada 29 da raiz).
  // Lido a 03/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): bloco 974372 (camada 30 da raiz).
  974372: { id: '00000000000000000001d704f53d346b433e831a3b3181807faa45639709ea1b', merkle_root: 'fa96e6056bd93c20496be688a5d901749e9eb4f3d7492293cffd572775a68f4e', timestamp: 1793694644 },
  // Lido a 07/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): blocos 974918 e 974919 (camada 31 da raiz).
  974918: { id: '00000000000000000000bd7457dcd1988dd9f56e2668bc47493d114d81c485fb', merkle_root: '52fa2e97beda8e8ad997ad3fb5fca468a7765e1beeec7c8d172e6129162ed4ff', timestamp: 1794046604 },
  974919: { id: '0000000000000000000037ab3f037871b708ad9fb6e4f260c98003ea02ef7332', merkle_root: '0542264873e35eb2282e5b4630e9f40e064cdc5f89cc7130aeac1f4a273f2242', timestamp: 1794046851 },
  974255: { id: '00000000000000000001c0d7f11ebd2e048729f34c254db842d4cf0cf42f6dee', merkle_root: '77029ccf424d4240077d1fec9c4b0c99a24d1a4a4878f65de92533f27b42797a', timestamp: 1793622834 },
  974257: { id: '000000000000000000016111a1a186aa1c07d83d16e2bc6d029e4db0ba850e1b', merkle_root: '1a839a63484c9b5b397a6eef54e87dcdf4c410c505be8faf36b04cecfb6ed3ac', timestamp: 1793623618 },
  974245: { id: '00000000000000000000d6ca93c32805774847dccf88537500f9365534cdfe98', merkle_root: '398257e9e46474382096cef025815bfe9c4f56e3517cdfc643681c8cf635c05e', timestamp: 1793616178 },
  974176: { id: '00000000000000000001e50d6be086a438cf1eff2c9fe5a92a5b925b813f76ec', merkle_root: '00efa59f20610f2280ed47ffe0b4b60f2cf3b0b63b012ab13b6c6684b0b29e47', timestamp: 1793566416 },
  // Lido a 08/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): blocos 974389 (camada 30, finney) e 974947 (camada 31, finney).
  974389: { id: '000000000000000000002bdf2a47d111c52dac516696a7e11bd6f077d6a8433c', merkle_root: '951d10e3a5f0fa626adf26c1ffc468c4bc2e7bdf4c121652a5ed75e2566aad5a', timestamp: 1793711028 },
  974947: { id: '000000000000000000004fe271a5eb9efee5b4b869bcdd2d5413f567fc8a025e', merkle_root: '62ab1472e39b4de904b525d48897aab2e8e19b6872e9cbb9a5b7f3c130fe8a3e', timestamp: 1794065885 },
  // Lido a 10/11/2026 em blockstream.info e mempool.space (as duas fontes concordam): blocos 975215 (camada 32, alice) e 975226 (camada 32, bob e finney).
  975215: { id: '000000000000000000005eb8d2a7e68765402f8a8914348f9f49b6e33ee4f4ec', merkle_root: 'af1c9e50bd7128c376528140f664d69cf44ae6dd33694e2ff241ca651d02f48a', timestamp: 1794256247 },
  975226: { id: '00000000000000000000086127e8a8d353964b72502503e189c3d450dfad023b', merkle_root: 'cdd13cbeb0a7a802e34e5c4d4fa0c1dd98bd0e4d531d236d9622db727721608d', timestamp: 1794269207 },
  974170: { id: '00000000000000000000f78ac28442b90ea9c308a0d593d850d6ac469ebe5b3c', merkle_root: 'ee22de7fcb31bf668f4c9dbffb0ff9c1832002dadd71c67e3207714344166115', timestamp: 1793564366 },
};
const recibos = { oro: fs.readFileSync('ancora/oro-v1.ots'), raiz: fs.readFileSync('ancora/raiz-registos.ots'), raiz2: fs.readFileSync('ancora/raiz-registos-2.ots'), raiz9: fs.readFileSync('ancora/raiz-registos-9.ots'), raiz10: fs.readFileSync('ancora/raiz-registos-10.ots'), raiz11: fs.readFileSync('ancora/raiz-registos-11.ots'), raiz12: fs.readFileSync('ancora/raiz-registos-12.ots'), raiz13: fs.readFileSync('ancora/raiz-registos-13.ots'), raiz14: fs.readFileSync('ancora/raiz-registos-14.ots'), raiz15: fs.readFileSync('ancora/raiz-registos-15.ots'), raiz16: fs.readFileSync('ancora/raiz-registos-16.ots'), raiz17: fs.readFileSync('ancora/raiz-registos-17.ots'), raiz18: fs.readFileSync('ancora/raiz-registos-18.ots'), raiz19: fs.readFileSync('ancora/raiz-registos-19.ots'), raiz20: fs.readFileSync('ancora/raiz-registos-20.ots'), raiz21: fs.readFileSync('ancora/raiz-registos-21.ots'), raiz22: fs.readFileSync('ancora/raiz-registos-22.ots'), raiz23: fs.readFileSync('ancora/raiz-registos-23.ots'), raiz24: fs.readFileSync('ancora/raiz-registos-24.ots'), raiz25: fs.readFileSync('ancora/raiz-registos-25.ots'), raiz26: fs.readFileSync('ancora/raiz-registos-26.ots'), raiz27: fs.readFileSync('ancora/raiz-registos-27.ots'), raiz28: fs.readFileSync('ancora/raiz-registos-28.ots'), raiz29: fs.readFileSync('ancora/raiz-registos-29.ots'), raiz30: fs.readFileSync('ancora/raiz-registos-30.ots'), raiz31: fs.readFileSync('ancora/raiz-registos-31.ots'), raiz32: fs.readFileSync('ancora/raiz-registos-32.ots') };

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
const ok19 = await conferirBlocos(recibos.raiz19, { fetcher: fetcherCom() });
assert.deepEqual(ok19.map((b) => b.altura), [974134, 974134]);
const ok20 = await conferirBlocos(recibos.raiz20, { fetcher: fetcherCom() });
assert.deepEqual(ok20.map((b) => b.altura), [974139, 974139]);
const ok21 = await conferirBlocos(recibos.raiz21, { fetcher: fetcherCom() });
assert.deepEqual(ok21.map((b) => b.altura), [974170, 974170]);
const ok22 = await conferirBlocos(recibos.raiz22, { fetcher: fetcherCom() });
assert.deepEqual(ok22.map((b) => b.altura), [974176, 974176]);
const ok23 = await conferirBlocos(recibos.raiz23, { fetcher: fetcherCom() });
assert.deepEqual(ok23.map((b) => b.altura), [974194, 974194]);
const ok24 = await conferirBlocos(recibos.raiz24, { fetcher: fetcherCom() });
assert.deepEqual(ok24.map((b) => b.altura), [974194, 974194]);
const ok25 = await conferirBlocos(recibos.raiz25, { fetcher: fetcherCom() });
assert.deepEqual(ok25.map((b) => b.altura), [974195, 974195]);
const ok26 = await conferirBlocos(recibos.raiz26, { fetcher: fetcherCom() });
assert.deepEqual(ok26.map((b) => b.altura), [974230, 974230]);
const ok27 = await conferirBlocos(recibos.raiz27, { fetcher: fetcherCom() });
assert.deepEqual(ok27.map((b) => b.altura), [974236, 974236]);
const ok28 = await conferirBlocos(recibos.raiz28, { fetcher: fetcherCom() });
assert.deepEqual(ok28.map((b) => b.altura), [974245, 974245]);
const ok29 = await conferirBlocos(recibos.raiz29, { fetcher: fetcherCom() });
assert.deepEqual(ok29.map((b) => b.altura), [974255, 974255, 974257]);
const ok30 = await conferirBlocos(recibos.raiz30, { fetcher: fetcherCom() });
assert.deepEqual(ok30.map((b) => b.altura), [974372, 974372, 974389]);
const ok31 = await conferirBlocos(recibos.raiz31, { fetcher: fetcherCom() });
assert.deepEqual(ok31.map((b) => b.altura), [974918, 974919, 974947]);
const ok32 = await conferirBlocos(recibos.raiz32, { fetcher: fetcherCom() });
assert.deepEqual(ok32.map((b) => b.altura), [975215, 975226, 975226]);
console.log(`Blocos conferidos com duas fontes: ${ok1.length + ok2.length + ok3.length + ok9.length + ok10.length + ok11.length + ok12.length + ok13.length + ok14.length + ok15.length + ok16.length + ok17.length + ok18.length + ok19.length + ok20.length + ok21.length + ok22.length + ok23.length + ok24.length + ok25.length + ok26.length + ok27.length + ok28.length + ok29.length + ok30.length + ok31.length + ok32.length} atestações.`);

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
