// Verifica que token/oro.json guarda a leitura externa do aviso da app de carteira (01/11/2026) como ela é:
// com a fronteira de que o critério não foi lido, sem a transformar em veredicto (nem "é fraude" nem "é seguro") e sem a apagar.
// Cada regra tem um estrago propositado: o mesmo teste, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';

function verificar(txt) {
  const o = JSON.parse(txt);
  assert.equal(o.symbol, 'ORO');
  assert.ok(Array.isArray(o.leituras_externas) && o.leituras_externas.length >= 1, 'a leitura externa do aviso foi apagada');
  const l = o.leituras_externas.find((x) => x.id === 'app-carteira-2026-11-01');
  assert.ok(l, 'falta a leitura app-carteira-2026-11-01');
  assert.match(l.quando_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(l.o_que_mostra, /Sinalizado como uma fraude/, 'o aviso tem de aparecer como a app o escreveu');
  assert.match(l.o_que_mostra, new RegExp(o.contract.slice(0, 6) + '…' + o.contract.slice(-4), 'i'), 'o aviso tem de dizer a que contrato se refere');
  assert.equal(l.criterio_lido, false, 'o critério do aviso não foi lido');
  assert.match(l.como_ler, /não o aceita nem o contesta/, 'a leitura não pode virar veredicto');
  for (const k of ['que o contrato seja uma fraude', 'que o contrato seja seguro', 'o critério do aviso', 'preço', 'liquidez', 'procura', 'receita']) assert.ok(l.nao_afirma.includes(k), `nao_afirma tem de incluir "${k}"`);
  assert.match(l.palavra_da_ora, /ninguém é convidado a comprá-lo/);
  assert.match(l.autorizado_por, /Unum/);
  // O registo do ORO não pode afirmar o que o aviso põe em causa nem o que a ORA nunca disse.
  const tudo = JSON.stringify({ ...o, leituras_externas: undefined }).toLowerCase();
  for (const w of ['seguro', 'garantid', 'sem risco', 'investimento seguro', 'valoriz', 'rendimento garantido']) assert.ok(!tudo.includes(w), `o registo do ORO não pode afirmar "${w}"`);
  assert.equal(o.market.price_observed, false); assert.equal(o.market.liquidity_observed, false);
}
const real = fs.readFileSync('token/oro.json', 'utf8');
verificar(real);
const mexer = (fn) => { const o = JSON.parse(real); fn(o); return JSON.stringify(o, null, 2); };
const estragos = [
  ['apaga a leitura externa', mexer((o) => { delete o.leituras_externas; })],
  ['esvazia a lista', mexer((o) => { o.leituras_externas = []; })],
  ['muda o id', mexer((o) => { o.leituras_externas[0].id = 'outra'; })],
  ['suaviza o aviso', mexer((o) => { o.leituras_externas[0].o_que_mostra = 'a app mostra o contrato sem avisos'; })],
  ['esquece o contrato', mexer((o) => { o.leituras_externas[0].o_que_mostra = 'Sinalizado como uma fraude, sem dizer onde'; })],
  ['diz que o critério foi lido', mexer((o) => { o.leituras_externas[0].criterio_lido = true; })],
  ['vira veredicto', mexer((o) => { o.leituras_externas[0].como_ler = 'o aviso está certo'; })],
  ['deixa de recusar "é seguro"', mexer((o) => { o.leituras_externas[0].nao_afirma = o.leituras_externas[0].nao_afirma.filter((x) => x !== 'que o contrato seja seguro'); })],
  ['deixa de recusar o preço', mexer((o) => { o.leituras_externas[0].nao_afirma = o.leituras_externas[0].nao_afirma.filter((x) => x !== 'preço'); })],
  ['convida a comprar', mexer((o) => { o.leituras_externas[0].palavra_da_ora = 'compre o ORO'; })],
  ['chama-lhe seguro', mexer((o) => { o.description += ' Seguro.'; })],
  ['promete valorização', mexer((o) => { o.description += ' Vai valorizar.'; })],
  ['afirma preço observado', mexer((o) => { o.market.price_observed = true; })],
  ['afirma liquidez observada', mexer((o) => { o.market.liquidity_observed = true; })],
];
let n = 0;
for (const [nome, estragado] of estragos) { assert.notEqual(estragado, JSON.stringify(JSON.parse(real), null, 2), `o estrago "${nome}" não alterou nada`); assert.throws(() => verificar(estragado), undefined, `estrago não apanhado: ${nome}`); n++; }
console.log(`oro-leitura-externa: o aviso está registado como é; ${n} estragos propositados apanhados.`);
