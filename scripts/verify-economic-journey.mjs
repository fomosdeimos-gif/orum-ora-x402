import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../api/economia');

const fixtures = {
  ora_aprendizagem_ultimo_snapshot_publica: [{ criado_em: '2026-08-10T05:30:00Z', acessos_externos: 3276, pagamentos: 19, compradores_externos: 0 }],
  ora_licencas_fisicas: [{ licenciado: '0xInternal', tx_hash: '0x1' }],
  ora_carteiras_classificacao: [{ endereco: '0xInternal', classificacao: 'interno' }],
};

global.fetch = async (url) => {
  const table = new URL(url).pathname.split('/').pop();
  return { ok: true, json: async () => fixtures[table] || [] };
};

let statusCode;
let body;
const response = {
  setHeader() {},
  status(code) { statusCode = code; return this; },
  end(value) { body = JSON.parse(value); },
};
await handler({}, response);

assert.equal(statusCode, 200);
assert.equal(body.format, 'orum-economic-journey/v1');
assert.equal(body.journey.probe.count, 3276);
assert.equal(body.journey.payment.count, 0);
assert.equal(body.journey.delivery.count, 0);
assert.equal(body.journey.return.count, 0);
assert.equal(body.external_confirmed_buyers, 0);
assert.equal(body.complete_external_cycles, 0);
assert.equal(body.internal_validation_payments, 19);
assert.equal(body.privacy.wallets_exposed, false);
assert.equal(JSON.stringify(body).includes('0xInternal'), false);

console.log(JSON.stringify({ verified: true, stages: Object.keys(body.journey), external_confirmed_buyers: 0 }));
