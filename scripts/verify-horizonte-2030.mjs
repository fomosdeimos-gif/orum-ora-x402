import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../horizonte-2030-v1.js',import.meta.url),'utf8');const context={globalThis:{}};vm.createContext(context);vm.runInContext(source,context);const evaluate=context.globalThis.ORUMHorizonte2030.evaluate;
const base=evaluate({sinais:{acessos_24h:208,reconhecidas:7144}},{payments:{external_confirmed_count:0,external_confirmed_usdc:0}},{stats:{scored:0}},new Date('2026-09-01T00:00:00Z'));
assert.equal(base.schema,'horizonte-2030/v1');assert.equal(base.trajectories[0].status,'presença observada');assert.equal(base.trajectories[1].status,'condição ainda não observada');assert.equal(base.trajectories[2].status,'desconhecido');assert.equal(base.balance_index,null);assert.equal(base.observed.sustenance.usdc_externo_total,0);
const external=evaluate({sinais:{reconhecidas:7144}},{payments:{external_confirmed_count:1,external_confirmed_usdc:1.5}},{stats:{scored:20}});
assert.equal(external.trajectories[1].status,'primeira liquidação externa observada');assert.equal(external.balance_index,null);console.log('horizonte-2030/v1: ok');
