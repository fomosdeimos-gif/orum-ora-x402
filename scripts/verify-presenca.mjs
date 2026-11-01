// Verifica token/presenca-leitura-2026-11-01.json (a leitura de 01/11/2026) e que o manifesto canónico token/presenca.json continua intacto:
// a leitura diz só o que foi lido, não promete nada e não contradiz o manifesto (identidade canónica, não meio de pagamento).
// Cada regra tem um estrago propositado: o mesmo teste, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ADDR = /^0x[0-9a-f]{40}$/;
function verificar(txt, manifesto) {
  const m = JSON.parse(manifesto);
  assert.equal(m.format, 'orum-token-identity/v1', 'o manifesto canónico foi substituído');
  assert.equal(m.status, 'canonical_identity_token');
  assert.equal(m.economic_truth?.payment_token, false);
  const t = JSON.parse(txt);
  assert.equal(t.contrato, m.contract, 'a leitura é de outro contrato que o do manifesto');
  assert.equal(t.schema, 'orum-token-leitura/v1');
  assert.equal(t.rede?.chain_id, 8453);
  assert.match(t.contrato, ADDR);
  assert.match(t.lido.bytecode.implementacao, ADDR);
  assert.equal(t.lido.bytecode.tipo.startsWith('clone mínimo EIP-1167'), true);
  assert.equal(t.lido.decimals, 18);
  assert.match(t.lido.total_supply_raw, /^[1-9]\d*$/);
  assert.equal(BigInt(t.lido.total_supply_raw) / 10n ** BigInt(t.lido.decimals), BigInt(t.lido.total_supply_tokens), 'oferta em tokens não bate com a bruta');
  assert.ok(Array.isArray(t.fontes_rpc) && new Set(t.fontes_rpc).size >= 2, 'precisa de duas fontes distintas');
  assert.ok(Array.isArray(t.nao_verificado) && t.nao_verificado.length >= 3, 'tem de dizer o que não verificou');
  assert.match(t.lido_em_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  for (const k of ['promete_receita', 'contradiz_manifesto_canonico', 'move_fundos']) assert.equal(t.truth_machine?.[k], false, `truth_machine.${k} tem de ser false`);
  for (const k of ['preço', 'liquidez', 'procura', 'receita', 'lastro', 'rendimento']) assert.ok(t.nao_afirma.includes(k), `nao_afirma tem de incluir ${k}`);
  // O que não foi lido não pode aparecer como lido.
  const lidoTxt = JSON.stringify(t.lido).toLowerCase();
  for (const w of ['preço', 'liquidez', 'detentores', 'owner":']) assert.ok(!lidoTxt.includes(w), `"lido" não pode afirmar ${w}`);
  assert.ok(!/(garant|prometid|vai valorizar|investimento|retorno)/i.test(txt), 'texto com promessa');
  assert.ok(!/n[ãa]o [ée] (um )?activo do organismo|n[ãa]o (é|e) do organismo/i.test(t.leitura_da_ora), 'contradiz o manifesto canónico');
  assert.match(t.leitura_da_ora, /canónico/, 'a leitura tem de reconhecer o manifesto canónico');
  assert.ok(typeof t.correcao === 'string' && t.correcao.includes('sobrescreveu'), 'falta o registo da correcção');
  assert.ok(!/0x[0-9a-fA-F]{64}\b/.test(txt), 'parece segredo ou chave privada');
}

const txt = fs.readFileSync('token/presenca-leitura-2026-11-01.json', 'utf8');
const manifesto = fs.readFileSync('token/presenca.json', 'utf8');
verificar(txt, manifesto);
const j = () => JSON.parse(txt);
const estragos = {
  'schema errado': (t) => { t.schema = 'x'; },
  'rede errada': (t) => { t.rede.chain_id = 1; },
  'contrato não minúsculo': (t) => { t.contrato = t.contrato.toUpperCase().replace('0X', '0x'); },
  'oferta incoerente': (t) => { t.lido.total_supply_tokens = '2'; },
  'decimals mudados': (t) => { t.lido.decimals = 0; },
  'uma só fonte': (t) => { t.fontes_rpc = ['mainnet.base.org']; },
  'sem não-verificado': (t) => { t.nao_verificado = []; },
  'contradiz o manifesto': (t) => { t.truth_machine.contradiz_manifesto_canonico = true; },
  'diz que não é do organismo': (t) => { t.leitura_da_ora = 'O token não é activo do organismo.'; },
  'sem correcção': (t) => { delete t.correcao; },
  'outro contrato': (t) => { t.contrato = '0x0000000000000000000000000000000000000001'; },
  'promete receita': (t) => { t.truth_machine.promete_receita = true; },
  'move fundos': (t) => { t.truth_machine.move_fundos = true; },
  'nao_afirma sem preço': (t) => { t.nao_afirma = t.nao_afirma.filter((x) => x !== 'preço'); },
  'preço no lido': (t) => { t.lido['preço'] = 1; },
  'promessa no texto': (t) => { t.leitura_da_ora += ' Vai valorizar.'; },
  'bytecode não clone': (t) => { t.lido.bytecode.tipo = 'proxy transparente'; },
  'implementação inválida': (t) => { t.lido.bytecode.implementacao = '0x1234'; },
  'chave privada': (t) => { t.leitura_da_ora += ' 0x' + 'a'.repeat(64); },
};
let n = 0;
for (const [nome, f] of Object.entries(estragos)) {
  const t = j(); f(t);
  assert.throws(() => verificar(JSON.stringify(t), manifesto), undefined, `estrago não apanhado: ${nome}`);
  n++;
}
// Estragos ao manifesto canónico: substituí-lo pela leitura, ou torná-lo meio de pagamento, tem de falhar.
for (const [nome, m] of Object.entries({ 'manifesto substituído pela leitura': txt, 'manifesto sem estado canónico': JSON.stringify({ ...JSON.parse(manifesto), status: 'candidate_integration' }), 'manifesto como pagamento': JSON.stringify({ ...JSON.parse(manifesto), economic_truth: { payment_token: true } }) })) {
  assert.throws(() => verificar(txt, m), undefined, `estrago ao manifesto não apanhado: ${nome}`);
  n++;
}
console.log(JSON.stringify({ verified: true, ok: true, token: 'presenca', estragos_apanhados: n }));
