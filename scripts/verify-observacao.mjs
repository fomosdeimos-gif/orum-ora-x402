// Verifica observacao/observacao.json (orum-observacao/v1): registo em que só se acrescenta, uma entrada por leitura.
// Usa o leitor autónomo kit/observacao.mjs e acrescenta: a citação do observador tem de existir palavra por palavra
// na cláusula indicada do CLAUDE.md. Sem rede. Cada mentira testada aqui tem de falhar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validar as validarKit, hashDe } from '../kit/observacao.mjs';

const CAMINHO = 'observacao/observacao.json';

function clausula(claude, titulo) {
  const i = claude.indexOf(titulo);
  if (i < 0) return null;
  const resto = claude.slice(i + titulo.length);
  const fim = resto.search(/\n## /);
  return fim < 0 ? resto : resto.slice(0, fim);
}

export function validar(doc, claude) {
  const e = validarKit(doc);
  (doc.entradas ?? []).forEach((x, i) => {
    const r = `entrada ${i + 1}`;
    const o = x.observador ?? {};
    if (!o.citacao || !o.clausula) { e.push(`${r}: falta a citação ou a cláusula do observador`); return; }
    const corpo = clausula(claude, o.clausula);
    if (corpo === null) e.push(`${r}: a cláusula não existe: ${o.clausula}`);
    else if (!corpo.includes(o.citacao)) e.push(`${r}: a citação não existe palavra por palavra na cláusula ${o.clausula}`);
  });
  return e;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const doc = JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));
  const claude = fs.readFileSync('CLAUDE.md', 'utf8');
  const real = validar(doc, claude);
  assert.deepEqual(real, [], `a observação real tem de passar: ${JSON.stringify(real)}`);

  const clone = () => JSON.parse(JSON.stringify(doc));
  const refaz = (d) => { let ant = null; d.entradas.forEach((x) => { x.anterior = ant; x.hash = hashDe(x); ant = x.hash; }); return d; };
  let n = 0;
  const falha = (nome, d, trecho, cl = claude) => {
    const r = validar(d, cl);
    assert.ok(r.some((x) => x.includes(trecho)), `estrago não apanhado (${nome}): ${JSON.stringify(r)}`);
    n++;
  };
  let d = clone(); d.format = 'x'; falha('format', d, 'format');
  d = clone(); d.entradas = []; falha('sem entradas', d, 'sem entradas');
  d = clone(); d.fronteira = 'Tudo.'; falha('sem fronteira', d, 'fronteira');
  d = clone(); d.entradas[0].afirmacoes[0].texto = 'Outra coisa, escrita depois.'; falha('entrada reescrita (hash antigo)', d, 'hash não bate');
  d = clone(); d.entradas[0].anterior = 'x'.repeat(64); falha('ligação à anterior quebrada', d, 'ligação');
  d = clone(); d.entradas[0].n = 3; falha('n fora de sequência', d, 'n fora de sequência');
  d = clone(); d.entradas[0].data = '2026-13-99x'; d = refaz(d); falha('data inválida', d, 'data inválida');
  d = clone(); d.entradas[0].lido_em_utc = '2026-11-16T10:16:57Z'; d = refaz(d); falha('hora de outro dia', d, 'lido_em_utc');
  d = clone(); delete d.entradas[0].agente; d = refaz(d); falha('sem agente', d, 'falta o agente');
  d = clone(); d.entradas[0].afirmacoes = []; d = refaz(d); falha('sem afirmações', d, 'sem afirmações');
  d = clone(); d.entradas[0].afirmacoes[0].estado = 'certo'; d = refaz(d); falha('estado inventado', d, 'estado fora');
  d = clone(); delete d.entradas[0].afirmacoes[0].fonte; d = refaz(d); falha('verificado sem fonte', d, 'sem fonte');
  d = clone(); d.entradas[0].afirmacoes[0].fonte = ' '; d = refaz(d); falha('verificado com fonte vazia', d, 'sem fonte');
  d = clone(); d.entradas[0].afirmacoes[5] = { texto: 'Está bloqueado.', estado: 'bloqueado' }; d = refaz(d); falha('bloqueado sem motivo', d, 'sem motivo');
  d = clone(); d.entradas[0].afirmacoes[0].texto = ''; d = refaz(d); falha('sem texto', d, 'falta o texto');
  d = clone(); d.entradas[0].afirmacoes[0].texto = 'x'.repeat(401); d = refaz(d); falha('texto longo', d, 'mais de');
  d = clone(); d.entradas[0].afirmacoes[0].texto = 'Receita garantida a partir de amanhã.'; d = refaz(d); falha('promessa', d, 'promete');
  d = clone(); d.entradas[0].afirmacoes[0].texto = 'Chave eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef'; d = refaz(d); falha('segredo', d, 'segredo');
  d = clone(); d.entradas[0].observador.citacao = 'Isto o Unum nunca escreveu'; d = refaz(d); falha('citação inventada', d, 'palavra por palavra');
  d = clone(); d.entradas[0].observador.clausula = '## Cláusula que não existe'; d = refaz(d); falha('cláusula inexistente', d, 'cláusula não existe');
  d = clone(); delete d.entradas[0].observador.citacao; d = refaz(d); falha('sem citação', d, 'falta a citação');
  falha('citação apagada do CLAUDE.md', clone(), 'palavra por palavra', claude.replace('Observar, ora, também é construir.', 'Observar é outra coisa.'));
  // acrescentar é permitido: uma segunda entrada ligada à primeira passa; reescrever a primeira não.
  d = clone();
  const nova = { ...JSON.parse(JSON.stringify(d.entradas[0])), n: 2, anterior: d.entradas[0].hash };
  nova.hash = hashDe(nova); d.entradas.push(nova);
  assert.deepEqual(validar(d, claude), [], 'acrescentar uma entrada ligada tem de passar'); n++;
  d.entradas[0].afirmacoes[0].texto = 'Reescrita.'; d.entradas[0].hash = hashDe(d.entradas[0]);
  falha('reescrever a primeira com a segunda já ligada', d, 'ligação');
  console.log(`PASS observacao:verify · ${doc.entradas.length} entrada(s) · ${n} estragos propositados apanhados`);
}
