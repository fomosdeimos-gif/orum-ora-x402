// Verifica economia/custos-mensais.json (Unum, 11/11/2026: "Eu autorizo").
// Cada despesa diz o seu estado de leitura. Só "verificado" entra no total medido, e exige fonte.
// Um custo bloqueado não tem valor; o total nunca afirma "custo total" enquanto houver itens por ler.
// Cada regra tem um estrago propositado: o mesmo teste, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ESTADOS = new Set(['verificado', 'nao_verificado', 'bloqueado']);
const doc = fs.readFileSync('docs/alvo-mensal-2026-11-11.md', 'utf8');

function verificar(txt) {
  const r = JSON.parse(txt);
  assert.equal(r.format, 'orum-custos-mensais/v1');
  assert.match(r.data, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(r.palavra_de_unum.citacao, 'Eu autorizo');
  assert.match(r.palavra_de_unum.cobre, /não lê faturas nem move fundos/);
  assert.equal(r.moeda_de_conta, 'EUR');
  // Câmbio: duas fontes, valor plausível, igual ao do documento.
  assert.ok(Number.isFinite(r.cambio.usdc_eur) && r.cambio.usdc_eur > 0.5 && r.cambio.usdc_eur < 1.5, 'câmbio implausível');
  assert.ok(Array.isArray(r.cambio.fontes) && r.cambio.fontes.length >= 2, 'o câmbio precisa de duas fontes');
  assert.ok(doc.includes(`**${String(r.cambio.usdc_eur).replace('.', ',')} EUR por USDC**`), 'o câmbio não é o do documento do alvo');
  // Itens.
  assert.ok(Array.isArray(r.itens) && r.itens.length > 0);
  const ids = r.itens.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
  let somaVerificada = 0;
  for (const i of r.itens) {
    assert.ok(ESTADOS.has(i.estado), `estado inválido em ${i.id}`);
    assert.ok(typeof i.descricao === 'string' && i.descricao.length > 0);
    if (i.estado === 'verificado') {
      assert.ok(typeof i.fonte === 'string' && i.fonte.length > 10, `${i.id} é verificado sem fonte`);
      assert.ok(Number.isFinite(i.valor_eur_mes) && i.valor_eur_mes >= 0, `${i.id} verificado sem valor`);
      assert.equal(i.bloqueio, undefined, `${i.id} verificado não tem bloqueio`);
      somaVerificada += i.valor_eur_mes;
    } else if (i.estado === 'bloqueado') {
      assert.equal(i.valor_eur_mes, null, `${i.id} bloqueado não pode ter valor`);
      assert.ok(typeof i.bloqueio === 'string' && i.bloqueio.length > 10, `${i.id} bloqueado sem dizer porquê`);
    } else {
      assert.ok(typeof i.nota === 'string' && i.nota.length > 10, `${i.id} não verificado sem nota`);
      assert.ok(Number.isFinite(i.valor_eur_mes) && i.valor_eur_mes >= 0);
      if (i.valor_min_eur_mes !== undefined) assert.ok(i.valor_min_eur_mes <= i.valor_eur_mes, `${i.id}: mínimo acima do máximo`);
    }
  }
  // Total.
  assert.equal(Math.round(somaVerificada * 1e6), Math.round(r.total.medido_verificado_eur_mes * 1e6), 'o total medido não é a soma dos verificados');
  const porLer = r.itens.filter((i) => i.estado !== 'verificado').map((i) => i.id).sort();
  assert.deepEqual([...r.total.itens_por_ler].sort(), porLer, 'itens_por_ler não corresponde aos que não estão verificados');
  assert.equal(r.total.afirma_custo_total, porLer.length === 0, 'afirma custo total com itens por ler (ou o contrário)');
  // Meses: só se acrescenta, por ordem, sem repetir; o último bate com os itens.
  assert.ok(Array.isArray(r.meses) && r.meses.length > 0);
  const m = r.meses.map((x) => x.mes);
  for (const x of m) assert.match(x, /^\d{4}-\d{2}$/);
  assert.deepEqual(m, [...new Set(m)].sort(), 'meses fora de ordem ou repetidos');
  const ult = r.meses[r.meses.length - 1];
  assert.equal(ult.total_verificado_eur, r.total.medido_verificado_eur_mes, 'o último mês não bate com o total');
  assert.equal(ult.itens_bloqueados, r.itens.filter((i) => i.estado === 'bloqueado').length);
  assert.equal(ult.itens_nao_verificados, r.itens.filter((i) => i.estado === 'nao_verificado').length);
  // Honestidade e segredos.
  assert.match(r.nao_prova, /não diz que o organismo custe zero/);
  assert.match(r.nao_prova, /não move fundos/);
  assert.ok(!/(secret|password|passphrase|api[_-]?key|private[_-]?key)\s*[:=]\s*\S{8,}/i.test(txt), 'parece conter um segredo');
  assert.ok(!/\b0x[0-9a-fA-F]{64}\b/.test(txt), 'contém 32 bytes em hexadecimal (chave?)');
}

const original = fs.readFileSync('economia/custos-mensais.json', 'utf8');
verificar(original);

// Estragos propositados: cada um tem de ser apanhado.
function estragar(f) { const r = JSON.parse(original); f(r); return JSON.stringify(r); }
const estragos = {
  'verificado sem fonte': (r) => { delete r.itens[0].fonte; },
  'verificado com valor em falta': (r) => { r.itens[0].valor_eur_mes = null; },
  'bloqueado com valor': (r) => { r.itens.find((i) => i.id === 'cdp').valor_eur_mes = 0; },
  'bloqueado sem bloqueio': (r) => { delete r.itens.find((i) => i.id === 'cdp').bloqueio; },
  'não verificado sem nota': (r) => { const i = r.itens.find((x) => x.id === 'taxa_btc_um_envio'); i.estado = 'nao_verificado'; delete i.fonte; delete i.nota; },
  'taxa verificada sem fonte': (r) => { delete r.itens.find((i) => i.id === 'taxa_btc_um_envio').fonte; },
  'gás verificado sem fonte': (r) => { delete r.itens.find((i) => i.id === 'gas_base_um_envio').fonte; },
  'gás verificado sem valor': (r) => { r.itens.find((i) => i.id === 'gas_base_um_envio').valor_eur_mes = null; },
  'gás promovido de novo a não verificado sem mexer no total': (r) => { r.itens.find((i) => i.id === 'gas_base_um_envio').estado = 'nao_verificado'; delete r.itens.find((i) => i.id === 'gas_base_um_envio').fonte; },
  'estado inventado': (r) => { r.itens[0].estado = 'quase_verificado'; },
  'id repetido': (r) => { r.itens[1].id = r.itens[0].id; },
  'total que não é a soma': (r) => { r.total.medido_verificado_eur_mes = 5; },
  'itens_por_ler incompleto': (r) => { r.total.itens_por_ler.pop(); },
  'afirma custo total com itens por ler': (r) => { r.total.afirma_custo_total = true; },
  'estimativa promovida a verificada sem fonte': (r) => { const i = r.itens.find((x) => x.id === 'ferramentas_de_unum'); i.estado = 'verificado'; i.valor_eur_mes = 1; delete i.bloqueio; },
  'mínimo acima do máximo': (r) => { const i = r.itens.find((x) => x.id === 'taxa_btc_um_envio'); i.estado = 'nao_verificado'; delete i.fonte; i.valor_min_eur_mes = 9; },
  'câmbio com uma só fonte': (r) => { r.cambio.fontes = [r.cambio.fontes[0]]; },
  'câmbio diferente do documento': (r) => { r.cambio.usdc_eur = 0.8; },
  'câmbio implausível': (r) => { r.cambio.usdc_eur = 9; },
  'meses fora de ordem': (r) => { r.meses.unshift({ mes: '2026-12', lido_em: '2026-12-01', total_verificado_eur: 0, itens_bloqueados: 3, itens_nao_verificados: 2 }); },
  'último mês não bate': (r) => { r.meses[0].itens_bloqueados = 0; },
  'citação de Unum trocada': (r) => { r.palavra_de_unum.citacao = 'Unum autoriza'; },
  'diz que custa zero': (r) => { r.nao_prova = 'receita, procura nem valor; não move fundos'; },
  'segredo escrito': (r) => { r.itens[0].nota = 'api_key: sk_live_abcdefgh12345678'; },
  'chave de 32 bytes': (r) => { r.itens[0].nota = '0x' + 'a'.repeat(64); }
};
let apanhados = 0;
for (const [nome, f] of Object.entries(estragos)) {
  let falhou = false;
  try { verificar(estragar(f)); } catch { falhou = true; }
  assert.ok(falhou, `estrago não apanhado: ${nome}`);
  apanhados++;
}
console.log(`custos-mensais: OK, ${JSON.parse(original).itens.length} itens, ${apanhados} estragos propositados apanhados`);
