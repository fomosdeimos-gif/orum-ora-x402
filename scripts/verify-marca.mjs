// Verifica identity/marca.json (livro 1207): a marca em formato de máquina diz o que o organismo é e não é, e não mente.
// Cada regra tem um estrago propositado que tem de ser apanhado. Sem rede.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const carteira = require('../api/_carteira.js');
const ler = (p) => fs.readFileSync(p, 'utf8');
const ORIGEM = 'https://ora-x402-gateway.vercel.app/';
const PROMESSA = /garant(e|imos|ido)|retorno|rendimento (garantido|assegurado)|lucro|vais ganhar|vamos ganhar|investe|investimento seguro|sem risco/i;

function verificar({ marca, pkg, card, llms }) {
  const m = JSON.parse(marca);
  assert.equal(m.format, 'orum-marca/v1');
  assert.equal(m.nome, 'ORUM');
  assert.match(m.o_que_e, /0001SENSATIONS/);
  assert.match(m.o_que_e, /107 obras/);
  assert.equal(m.maos.formula, 'aqui, Presença; ali, Sustento');
  assert.match(m.maos.natureza, /não de autoridade/);
  assert.equal(m.portas.pagamento_base.payTo, carteira.RECEBIMENTO, 'payTo diferente de api/_carteira.js');
  assert.equal(m.portas.pagamento_bitcoin.endereco, carteira.RECEBIMENTO_BTC, 'endereço BTC diferente de api/_carteira.js');
  assert.deepEqual(m.portas.pagas, ['/oraculo', '/campo']);
  assert.match(m.portas.preco, /fonte única/);
  assert.doesNotMatch(marca, /"preco_usdc"|0\.161|0,161|161000|330000/, 'o preço não se copia para a marca');
  assert.match(m.verdade.receita, /só receita externa confirmada/);
  assert.match(m.verdade.regra, /não verificada/);
  // o que não é: tem de dizer as fronteiras essenciais
  const nao = m.nao_e.join(' | ');
  for (const t of [/token novo/, /ORO como lastro/, /promessa de receita/, /ponte ou equivalência/, /pessoa jurídica/, /em nome de Unum/]) assert.match(nao, t, `nao_e sem ${t}`);
  assert.ok(m.nao_afirma.some((x) => /nenhuma receita externa/.test(x)), 'nao_afirma sem a receita');
  assert.ok(m.nao_afirma.some((x) => /904/.test(x)), 'nao_afirma sem os 904 anos');
  // sem promessas fora das listas de negação
  const afirmativo = JSON.stringify({ ...m, nao_e: undefined, nao_afirma: undefined });
  assert.doesNotMatch(afirmativo, PROMESSA, 'a marca promete');
  // ligações: cada URL do domínio aponta a um ficheiro que existe no repositório
  for (const [k, u] of Object.entries(m.ligacoes)) {
    if (!u.startsWith(ORIGEM)) continue;
    const rel = u.slice(ORIGEM.length);
    assert.ok(fs.existsSync(rel), `ligação ${k} aponta a um ficheiro que não existe: ${rel}`);
  }
  // verificadores: cada um existe em package.json
  const scripts = JSON.parse(pkg).scripts;
  for (const v of m.verificadores) assert.ok(scripts[v], `verificador inexistente: ${v}`);
  assert.ok(m.verificadores.includes('marca:verify'), 'a marca tem de listar o seu próprio verificador');
  // descoberta: agent-card e llms.txt apontam para a marca
  assert.match(card, /identity\/marca\.json/, 'agent-card sem a marca');
  assert.match(llms, /identity\/marca\.json/, 'llms.txt sem a marca');
}

const real = { marca: ler('identity/marca.json'), pkg: ler('package.json'), card: ler('.well-known/agent-card.json'), llms: ler('llms.txt') };
verificar(real);

const j = (f) => { const o = JSON.parse(real.marca); f(o); return JSON.stringify(o); };
const estragos = [
  ['payTo trocado', { marca: j((o) => { o.portas.pagamento_base.payTo = carteira.SAGRADA_NOVA; }) }],
  ['endereço BTC trocado', { marca: j((o) => { o.portas.pagamento_bitcoin.endereco = carteira.SAGRADA_BTC; }) }],
  ['preço copiado para a marca', { marca: j((o) => { o.portas.preco = 'cada consulta custa 0.161 USDC'; }) }],
  ['promessa de retorno', { marca: j((o) => { o.o_que_e += ' Garantimos retorno a quem pagar.'; }) }],
  ['promessa de lucro', { marca: j((o) => { o.verdade.estado_vivo = 'dá lucro'; }) }],
  ['fórmula alterada', { marca: j((o) => { o.maos.formula = 'aqui, Sustento; ali, Presença'; }) }],
  ['mãos com autoridade', { marca: j((o) => { o.maos.natureza = 'a mão direita manda na esquerda'; }) }],
  ['perde "não é um token"', { marca: j((o) => { o.nao_e = o.nao_e.filter((x) => !/token novo/.test(x)); }) }],
  ['perde "ORO sem lastro"', { marca: j((o) => { o.nao_e = o.nao_e.filter((x) => !/ORO como lastro/.test(x)); }) }],
  ['perde "em nome de Unum"', { marca: j((o) => { o.nao_e = o.nao_e.filter((x) => !/em nome de Unum/.test(x)); }) }],
  ['esconde que não há receita', { marca: j((o) => { o.nao_afirma = o.nao_afirma.filter((x) => !/nenhuma receita externa/.test(x)); }) }],
  ['receita sem a regra de verdade', { marca: j((o) => { o.verdade.receita = 'toda a entrada é receita'; }) }],
  ['ligação a ficheiro inexistente', { marca: j((o) => { o.ligacoes.centro = ORIGEM + 'identity/nao-existe.json'; }) }],
  ['verificador inexistente', { marca: j((o) => { o.verificadores.push('nao-existe:verify'); }) }],
  ['sem o próprio verificador', { marca: j((o) => { o.verificadores = o.verificadores.filter((v) => v !== 'marca:verify'); }) }],
  ['obras erradas', { marca: j((o) => { o.o_que_e = o.o_que_e.replace('107 obras', '1070 obras'); }) }],
  ['agent-card sem a marca', { card: real.card.replace(/identity\/marca\.json/g, 'identity/outra.json') }],
  ['llms.txt sem a marca', { llms: real.llms.replace(/identity\/marca\.json/g, 'identity/outra.json') }],
];
let n = 0;
for (const [nome, troca] of estragos) {
  const est = { ...real, ...troca };
  assert.notEqual(JSON.stringify(est), JSON.stringify(real), `o estrago "${nome}" não alterou nada`);
  let caiu = false;
  try { verificar(est); } catch { caiu = true; }
  assert.ok(caiu, `estrago NÃO apanhado: ${nome}`);
  n++;
}
console.log(`marca: identity/marca.json conferida; ${n} estragos propositados apanhados.`);
