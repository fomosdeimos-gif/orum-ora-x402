import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { sondar, sondarRota, sondarFacilitador, CONTRATO, ROTAS, FACILITADORES, BASE } from './sonda-pagamento.mjs';

const require = createRequire(import.meta.url);
const carteira = require('../api/_carteira.js');
const facilitador = require('../api/_facilitador.js');

// A cópia dos valores fixos da sonda tem de bater com as fontes únicas do código.
assert.equal(CONTRATO.payTo, carteira.RECEBIMENTO, 'payTo da sonda difere de api/_carteira.js');
assert.deepEqual(CONTRATO.payToAceites, [carteira.RECEBIMENTO], 'payTo aceites pela sonda diferem de api/_carteira.js');
assert.equal(CONTRATO.network, facilitador.REDE, 'rede da sonda difere de api/_facilitador.js');
assert.deepEqual(FACILITADORES, facilitador.URLS_PADRAO, 'facilitadores da sonda diferem de api/_facilitador.js');

const desafio = (mut = {}) => ({ x402Version: 2, accepts: [{ scheme: 'exact', network: CONTRATO.network, amount: '161000', asset: CONTRATO.asset, payTo: CONTRATO.payTo, ...mut }] });
const resp = (status, corpo, cabecalho) => ({ status, texto: typeof corpo === 'string' ? corpo : JSON.stringify(corpo), headers: { get: (n) => (n === 'payment-required' ? cabecalho ?? null : null) } });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const suportado = { kinds: [{ x402Version: 2, scheme: 'exact', network: CONTRATO.network }] };

function fetcherCom({ rota, fac } = {}) {
  return async (url) => {
    if (url.startsWith(BASE)) return rota ? rota(url) : resp(402, desafio(), b64(desafio()));
    return fac ? fac(url) : resp(200, suportado);
  };
}

const bom = await sondar({ fetcher: fetcherCom() });
assert.equal(bom.ok, true);
assert.equal(bom.algum_facilitador_pronto, true);
assert.equal(bom.rotas.length, Object.keys(ROTAS).length);
console.log('Sonda simulada conferida: 2 rotas, 2 facilitadores.');

const rotaMa = async (nome, rota) => assert.equal((await sondarRota('/oraculo', { fetcher: fetcherCom({ rota }) })).ok, false, `estrago não apanhado: ${nome}`);
await rotaMa('200 em vez de 402', () => resp(200, { ok: true }));
for (const errado of [carteira.SAGRADA_NOVA, carteira.RECEBIMENTO_EDGE, '0x' + '5'.repeat(40)]) await rotaMa('payTo trocado ' + errado.slice(0, 8), () => resp(402, desafio({ payTo: errado }), b64(desafio({ payTo: errado }))));
for (const certo of [carteira.RECEBIMENTO]) assert.equal((await sondarRota('/oraculo', { fetcher: fetcherCom({ rota: () => resp(402, desafio({ payTo: certo }), b64(desafio({ payTo: certo }))) }) })).ok, true, 'payTo legitimo recusado: ' + certo);
await rotaMa('esquema upto', () => resp(402, desafio({ scheme: 'upto' }), b64(desafio({ scheme: 'upto' }))));
await rotaMa('activo trocado', () => resp(402, desafio({ asset: '0x0000000000000000000000000000000000000001' }), b64(desafio({ asset: '0x0000000000000000000000000000000000000001' }))));
await rotaMa('sem Base mainnet', () => resp(402, desafio({ network: 'eip155:1' }), b64(desafio({ network: 'eip155:1' }))));
await rotaMa('montante zero', () => resp(402, desafio({ amount: '0' }), b64(desafio({ amount: '0' }))));
await rotaMa('cabeçalho ilegível', () => resp(402, 'não é json', '###'));
await rotaMa('falha de rede', () => { throw new Error('ECONNRESET'); });
const semBase = await sondarFacilitador(FACILITADORES[0], { fetcher: fetcherCom({ fac: () => resp(200, { kinds: [{ x402Version: 1, scheme: 'exact', network: 'base' }] }) }) });
assert.equal(semBase.anuncia_base_exact_v2, false, 'estrago não apanhado: facilitador só v1');
const em404 = await sondarFacilitador(FACILITADORES[0], { fetcher: fetcherCom({ fac: () => resp(404, 'x') }) });
assert.equal(em404.anuncia_base_exact_v2, false, 'estrago não apanhado: facilitador 404');
// preço diferente do visto só é marcado, não falha o contrato
const outro = await sondarRota('/oraculo', { fetcher: fetcherCom({ rota: () => resp(402, desafio({ amount: '999' }), b64(desafio({ amount: '999' }))) }) });
assert.equal(outro.ok, true);
assert.equal(outro.preco_mudou, true);
console.log('Estragos propositados apanhados: 10.');
