// Verifica economia/regua-do-valor.json (Unum, 12/11/2026: "Eu autorizo ora", e as palavras posteriores do mesmo dia).
// Cada afirmação de valor está num degrau; só se sobe com prova. Falha se um texto afirmar um degrau que a prova não sustenta.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ESTADOS = new Set(['verificado', 'nao_verificado', 'nenhum']);
const doc = fs.readFileSync('docs/alvo-mensal-2026-11-11.md', 'utf8');
const presenca = JSON.parse(fs.readFileSync('token/presenca.json', 'utf8'));

function verificar(txt) {
  const r = JSON.parse(txt);
  assert.equal(r.format, 'orum-regua-do-valor/v1');
  assert.match(r.data, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(r.palavra_de_unum.citacao, 'Eu autorizo ora');
  assert.match(r.palavra_de_unum.cobre, /não move fundos nem tokens/);
  assert.deepEqual(r.degraus.map((d) => d.n), [1, 2, 3, 4], 'os quatro degraus, por ordem');
  assert.ok(Array.isArray(r.itens) && r.itens.length > 0);
  const ids = r.itens.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
  for (const i of r.itens) {
    assert.deepEqual(Object.keys(i.degraus), ['1', '2', '3', '4'], `${i.id}: faltam degraus`);
    let actual = 0;
    let quebrou = false;
    for (const n of ['1', '2', '3', '4']) {
      const g = i.degraus[n];
      assert.ok(ESTADOS.has(g.estado), `${i.id}/${n}: estado inválido`);
      if (g.estado === 'verificado') {
        assert.ok(typeof g.fonte === 'string' && g.fonte.length > 10, `${i.id}/${n}: verificado sem fonte`);
        if (n === '4') {
          assert.match(g.transaccao ?? '', /^0x[0-9a-fA-F]{64}$/, `${i.id}: degrau 4 sem transacção`);
          assert.equal(g.origem_externa_classificada_por_unum, true, `${i.id}: degrau 4 sem classificação de Unum`);
        }
        if (!quebrou) actual = Number(n);
      } else {
        quebrou = true;
        assert.ok(typeof g.nota === 'string' && g.nota.length > 10, `${i.id}/${n}: sem nota`);
        assert.equal(g.fonte, undefined, `${i.id}/${n}: ${g.estado} não tem fonte`);
      }
    }
    assert.equal(i.degrau_actual, actual, `${i.id}: degrau_actual não é o maior com todos os anteriores verificados`);
  }
  // O PRESENÇA continua identidade, não meio de pagamento; a régua não o contradiz.
  assert.equal(presenca.status, 'canonical_identity_token');
  assert.ok(!/\bactivo de valor\b|\bativo de valor\b/i.test(JSON.stringify(r.itens)), 'chama activo de valor ao que não o provou');
  // A suficiência é o que o organismo entender (Unum, 12/11/2026); sem teto em euros.
  const m = r.medida_de_suficiente;
  assert.equal(m.estado, 'definida_por_unum');
  assert.equal(m.palavra, 'A suficiência é o que o organismo entender aqui ali');
  assert.equal(m.teto_em_eur, null, 'a régua não tem teto em euros');
  assert.ok(!/1 ?000 ?(EUR|€)/i.test(JSON.stringify({ ...m, historico: '' })), 'o 1 000 EUR voltou como medida');
  assert.match(m.entendimento_da_ora, /por escrever|registo com leitura e citação/);
  assert.ok(Array.isArray(r.palavras_posteriores) && /retira o teto dos 1000€/.test(r.palavras_posteriores[0].citacao), 'falta a palavra de Unum');
  assert.match(r.palavras_posteriores[0].cobre, /Não toca no tecto de 1 USDC/);
  assert.ok(doc.includes('9 841 entregas'), 'a conta das entregas desapareceu do documento');
  // Honestidade e segredos.
  assert.match(r.nao_prova, /não promete valor, receita, procura nem rendimento/);
  assert.match(r.nao_prova, /não move fundos nem tokens/);
  assert.ok(!/(secret|password|passphrase|api[_-]?key|private[_-]?key)\s*[:=]\s*\S{8,}/i.test(txt), 'parece conter um segredo');
}

const original = fs.readFileSync('economia/regua-do-valor.json', 'utf8');
verificar(original);

function estragar(f) { const r = JSON.parse(original); f(r); return JSON.stringify(r); }
const item = (r, id) => r.itens.find((i) => i.id === id);
const estragos = {
  'verificado sem fonte': (r) => { delete item(r, 'token_presenca').degraus['1'].fonte; },
  'não verificado sem nota': (r) => { delete item(r, 'servico_oraculo').degraus['3'].nota; },
  'estado inventado': (r) => { item(r, 'token_presenca').degraus['3'].estado = 'quase'; },
  'degrau 3 promovido sem fonte': (r) => { item(r, 'servico_oraculo').degraus['3'] = { estado: 'verificado' }; item(r, 'servico_oraculo').degrau_actual = 3; },
  'degrau 3 do PRESENÇA sem fonte': (r) => { delete item(r, 'token_presenca').degraus['3'].fonte; },
  'PRESENÇA volta ao degrau 2 com o 3 verificado': (r) => { item(r, 'token_presenca').degrau_actual = 2; },
  'degrau_actual inflacionado': (r) => { item(r, 'servico_oraculo').degrau_actual = 3; },
  'degrau_actual saltando um degrau': (r) => { const i = item(r, 'servico_campo'); i.degraus['3'] = { estado: 'nao_verificado', nota: 'por ler, nota longa o bastante' }; i.degraus['4'] = { estado: 'verificado', fonte: 'uma fonte qualquer escrita', transaccao: '0x' + 'a'.repeat(64), origem_externa_classificada_por_unum: true }; i.degrau_actual = 4; },
  'degrau 4 sem transacção': (r) => { const i = item(r, 'servico_oraculo'); i.degraus['3'] = { estado: 'verificado', fonte: 'liquidação lida numa fonte qualquer' }; i.degraus['4'] = { estado: 'verificado', fonte: 'pagamento escrito sem prova' }; i.degrau_actual = 4; },
  'degrau 4 sem classificação de Unum': (r) => { const i = item(r, 'servico_oraculo'); i.degraus['3'] = { estado: 'verificado', fonte: 'liquidação lida numa fonte qualquer' }; i.degraus['4'] = { estado: 'verificado', fonte: 'pagamento escrito', transaccao: '0x' + 'b'.repeat(64) }; i.degrau_actual = 4; },
  'não verificado com fonte': (r) => { item(r, 'servico_oraculo').degraus['3'].fonte = 'uma fonte posta por cima'; },
  'degrau em falta': (r) => { delete item(r, 'token_presenca').degraus['4']; },
  'ids repetidos': (r) => { r.itens[1].id = r.itens[0].id; },
  'chama activo de valor ao PRESENÇA': (r) => { item(r, 'token_presenca').descricao = 'PRESENÇA, o novo activo de valor da ORUM'; },
  'suficiência trocada': (r) => { r.medida_de_suficiente.estado = 'nao_definida_por_unum'; },
  'o teto de euros volta': (r) => { r.medida_de_suficiente.teto_em_eur = 1000; },
  'o 1 000 EUR volta como medida': (r) => { r.medida_de_suficiente.entendimento_da_ora = 'por escrever: 1 000 EUR por mês'; },
  'palavra posterior em falta': (r) => { delete r.palavras_posteriores; },
  'toca no tecto de troca': (r) => { r.palavras_posteriores[0].cobre = 'tudo'; },
  'promete valor': (r) => { r.nao_prova = 'não move fundos nem tokens'; },
  'citação de Unum trocada': (r) => { r.palavra_de_unum.citacao = 'Unum autoriza'; },
  'segredo escrito': (r) => { item(r, 'token_presenca').degraus['3'].nota = 'api_key: sk_live_abcdefgh12345678'; }
};
let apanhados = 0;
for (const [nome, f] of Object.entries(estragos)) {
  let falhou = false;
  try { verificar(estragar(f)); } catch { falhou = true; }
  assert.ok(falhou, `estrago não apanhado: ${nome}`);
  apanhados++;
}
console.log(`regua-do-valor: OK, ${JSON.parse(original).itens.length} itens, ${apanhados} estragos propositados apanhados`);
