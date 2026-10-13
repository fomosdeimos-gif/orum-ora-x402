// Verifica, sem rede, que os dois contratos VALIUM e o aviso de "sem ponte" aparecem iguais
// em todas as superficies. Prova coerencia entre ficheiros, nao o estado on-chain.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const reg = JSON.parse(read('identity/valium.json'));
const eth = reg.contratos.find((c) => c.chainId === 1).contract;
const base = reg.contratos.find((c) => c.chainId === 8453).contract;
assert.equal(reg.contratos.length, 2, 'o registo tem de ter exactamente dois contratos');
assert.notEqual(eth.toLowerCase(), base.toLowerCase());
assert.ok(reg.avisos.some((a) => /sem ponte/i.test(a)), 'registo sem aviso de ausencia de ponte');

const card = read('.well-known/agent-card.json');
const onchain = read('supabase/functions/ora-onchain-leitura/index.ts');
assert.ok(onchain.toLowerCase().includes(base.toLowerCase()), 'leitura on-chain usa outro VALIUM de Base');
for (const f of ['llms.txt', '.well-known/agent-card.json', 'arquivo.html', 'organismo.html']) {
  const t = read(f).toLowerCase();
  assert.ok(t.includes(eth.toLowerCase()), `${f} sem o VALIUM de Ethereum`);
  assert.ok(t.includes(base.toLowerCase()), `${f} sem o VALIUM de Base`);
}
for (const f of ['llms.txt', '.well-known/agent-card.json']) {
  assert.ok(read(f).includes('/identity/valium.json'), `${f} sem ligacao ao registo`);
}
JSON.parse(card);
console.log('valium:verify ok · 2 contratos coerentes em 4 superficies');
