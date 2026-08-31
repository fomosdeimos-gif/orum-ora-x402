import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../escolha-v0.js', import.meta.url), 'utf8');
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(source, context);
const evaluate = context.globalThis.ORUMChoiceV0.evaluate;

const result = evaluate({
  sentinela: { veredicto: 'OBSERVAR' },
  convite: { maquinas_reconhecidas_total: 7142, visitas_a_sondar: 7125, visitas_pagas: 17 },
  eventos: [{ tipo: 'acesso' }, { tipo: 'pagamento' }],
  timestamp: '2026-08-31T20:00:13.954Z'
});

assert.equal(result.modelo, 'escolha-verificavel/v0');
assert.equal(result.decisao, 'observe');
assert.equal(result.escolha.id, 'observar_funil');
assert.ok(result.confianca < 70, 'v0 must preserve uncertainty');
assert.match(result.limites.join(' '), /liquidação externa/);

const unknown = evaluate({});
assert.equal(unknown.sinais.pagas, null);
assert.ok(unknown.confianca < result.confianca);
console.log('escolha-verificavel/v0: ok');
