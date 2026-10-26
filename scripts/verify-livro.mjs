// Verifica a cópia do livro (livro/ora_mudancas.jsonl) e a maquinaria que a escreve. Sem rede.
// Uso: node scripts/verify-livro.mjs [--base linhas.json]   (com --base cruza a cópia com linhas lidas da tabela)
// Cada mentira testada aqui tem de falhar.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CAMINHO, ZERO, acrescentar, ler, novaLinha, validar, validarImpressao } from './lib/livro.mjs';
import { readdirSync } from 'node:fs';

const i = process.argv.indexOf('--base');
const base = i > 0 ? JSON.parse(readFileSync(process.argv[i + 1], 'utf8')) : null;

if (existsSync(CAMINHO)) {
  const r = validar(readFileSync(CAMINHO, 'utf8'), base);
  assert.deepEqual(r.erros, [], 'a cópia real tem de passar');
  console.log(`Cópia do livro: ${r.linhas} instantâneos, ${r.ids} ids${base ? `, ${r.porActualizar.length} por actualizar face à base` : ''}.`);
} else {
  console.log('Cópia do livro: ainda não existe (por exportar); só a maquinaria é conferida.');
}

// Maquinaria, sobre linhas de exemplo (nada daqui vai para a cópia real).
const L = (id, extra = {}) => ({ id, quando: '2026-10-26 10:00:00+00', agente: id % 2 ? 'ORA (Claude Code)' : 'Codex/OpenAI', o_que: `linha ${id}`, estado: 'concluido', evidencia: null, ...extra });
const montar = (linhas) => { let t = ''; let prev = ZERO; let n = 1; for (const l of linhas) { const nl = novaLinha(prev, n++, '2026-10-26T14:00Z', l); t += JSON.stringify(nl) + '\n'; prev = nl.sha256; } return t; };
const bom = montar([L(1), L(2), L(3)]);
assert.deepEqual(validar(bom).erros, [], 'a cadeia de exemplo tem de passar');
let n = 0;
const falha = (nome, texto, trecho, b = null) => {
  const e = validar(texto, b).erros;
  assert.ok(e.some((x) => x.includes(trecho)), `estrago não apanhado (${nome}): ${JSON.stringify(e)}`);
  n++;
};
const ls = () => bom.split('\n').filter(Boolean);
falha('linha alterada', bom.replace('linha 2', 'linha dois'), 'sha256 não bate');
falha('linha apagada no meio', [ls()[0], ls()[2]].join('\n') + '\n', 'esperava 2');
falha('linhas trocadas', [ls()[0], ls()[2], ls()[1]].join('\n') + '\n', 'cadeia partida');
falha('linha repetida', [...ls(), ls()[2]].join('\n') + '\n', 'esperava 4');
falha('cadeia religada à mão sem refazer o selo', bom.replace(/"prev":"[0-9a-f]{64}"/, `"prev":"${'1'.repeat(64)}"`), 'cadeia partida');
falha('JSON inválido', bom + '{não é json\n', 'JSON inválido');
falha('sem marca de cópia', bom.replace('"copia":true', '"copia":false'), 'marca de cópia');
falha('id do instantâneo diferente do da linha', bom.replace('"id":2,', '"id":9,'), 'id do instantâneo');
falha('segredo na linha', montar([L(1, { o_que: 'chave sk_' + 'a'.repeat(24) })]), 'segredo');
falha('chave PEM na linha', montar([L(1, { o_que: '-----BEGIN PRIVATE KEY-----' })]), 'segredo');
falha('JWT na linha', montar([L(1, { o_que: 'eyJ' + 'a'.repeat(24) + '.' + 'b'.repeat(12) + '.x' })]), 'segredo');
falha('copiado_em inválido', bom.replace('2026-10-26T14:00Z', 'ontem'), 'copiado_em');
falha('cópia com id que a base não tem', bom, 'a base não o tem', [L(1), L(2)]);
// Cruzar com a base: o que a base tem de novo ou de diferente fica por actualizar, não é erro.
assert.deepEqual(validar(bom, [L(1), L(2), L(3)]).porActualizar, [], 'igual à base: nada por actualizar');
assert.deepEqual(validar(bom, [L(1), L(2), L(3), L(4)]).porActualizar, [4], 'id novo na base');
assert.deepEqual(validar(bom, [L(1), L(2), L(3, { estado: 'em_curso' })]).porActualizar, [3], 'linha mudada na base');
// Acrescentar: só o novo ou o mudado, sem tocar no que existe, e continua a passar.
const existentes = ler(bom);
assert.equal(acrescentar(existentes, [L(1), L(2), L(3)], '2026-10-27T10:00Z').length, 0, 'sem mudanças não acrescenta');
const novas = acrescentar(existentes, [L(1), L(2), L(3, { estado: 'x' }), L(4)], '2026-10-27T10:00Z');
assert.equal(novas.length, 2, 'acrescenta a mudada e a nova');
const depois = bom + novas.map((l) => JSON.stringify(l)).join('\n') + '\n';
assert.deepEqual(validar(depois).erros, [], 'depois de acrescentar passa');
assert.equal(depois.startsWith(bom), true, 'o que existia não mudou');
assert.deepEqual(validar(depois, [L(1), L(2), L(3, { estado: 'x' }), L(4)]).porActualizar, [], 'a última versão de cada id é a da base');
// Uma linha da outra mão copia-se tal como está.
assert.equal(ler(bom)[1].linha.agente, 'Codex/OpenAI');
console.log(`Maquinaria do livro conferida: ${n} estragos propositados apanhados.`);

// Impressão do livro: a real tem de passar, e cada mentira tem de falhar.
const impressoes = existsSync('livro') ? readdirSync('livro').filter((f) => /^impressao-.*\.json$/.test(f)) : [];
for (const f of impressoes) {
  const real = JSON.parse(readFileSync(`livro/${f}`, 'utf8'));
  assert.deepEqual(validarImpressao(real), [], `${f}: a impressão real tem de passar`);
  let m = 0;
  const estraga = (nome, mexer, trecho) => {
    const o = JSON.parse(JSON.stringify(real)); mexer(o);
    const er = validarImpressao(o);
    assert.ok(er.some((x) => x.includes(trecho)), `estrago não apanhado (${nome}): ${JSON.stringify(er)}`);
    m++;
  };
  estraga('hash de um bloco alterado', (o) => { o.blocos[3].hash = 'f'.repeat(64); }, 'raiz não bate');
  estraga('hash inválido', (o) => { o.blocos[2].hash = 'xyz'; }, 'hash inválido');
  estraga('bloco apagado', (o) => { o.blocos.splice(4, 1); }, 'esperava 4');
  estraga('blocos trocados', (o) => { [o.blocos[1], o.blocos[2]] = [o.blocos[2], o.blocos[1]]; }, 'esperava 1');
  estraga('n alterado', (o) => { o.blocos[0].n = 50; }, 'soma dos blocos');
  estraga('intervalo fora do bloco', (o) => { o.blocos[1].de = 5; }, 'intervalo fora');
  estraga('raiz alterada', (o) => { o.raiz.sha256 = '0'.repeat(64); }, 'raiz não bate');
  estraga('sem sql', (o) => { o.sql = ''; }, 'sql');
  estraga('último bloco não provisório', (o) => { delete o.blocos.at(-1).provisorio; }, 'provisório');
  estraga('sem citação de Unum', (o) => { delete o.autorizacao_de_unum; }, 'citação de Unum');
  estraga('afirma guardar o conteúdo', (o) => { o.nao_afirma = []; }, 'fora da base');
  estraga('promessa', (o) => { o.objecto += ' para sempre'; }, 'promessa');
  console.log(`Impressão ${f}: ${real.blocos.length} blocos, ${real.linhas} linhas, ${m} estragos propositados apanhados.`);
}
