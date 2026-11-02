// Verifica identity/espelho-oruming.json (kit/espelho-oruming.mjs): contagens refeitas nas citações de Unum, perguntas sem diagnóstico nem promessa,
// respostas só em citação literal, entradas encadeadas. Cada mentira testada aqui tem de falhar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validar, hashDe, contar, MAX_LINHA } from '../kit/espelho-oruming.mjs';

const doc = JSON.parse(fs.readFileSync('identity/espelho-oruming.json', 'utf8'));
const espelho = JSON.parse(fs.readFileSync('identity/espelho.json', 'utf8'));
const claude = fs.readFileSync('CLAUDE.md', 'utf8');
const real = validar(doc, espelho, claude);
assert.deepEqual(real, [], `o oruming do espelho real tem de passar: ${JSON.stringify(real)}`);

// a contagem em si: fronteira de palavra, uma citação de cada vez, só até ao id pedido
const fake = { citacoes: [{ id: 1, citacao: 'Aqui ali e aqui' }, { id: 2, citacao: 'ali' }, { id: 3, citacao: 'aqui' }, { id: 4, citacao: 'qualiqui aqui alinhado' }] };
assert.deepEqual(contar(fake, 'aqui ali', 4), { ocorrencias: 1, citacoes_ids: [1] }, 'aqui ali só dentro de uma citação');
assert.deepEqual(contar(fake, 'aqui', 4), { ocorrencias: 4, citacoes_ids: [1, 3, 4] }, 'fronteira de palavra: qualiqui e alinhado não contam');
assert.deepEqual(contar(fake, 'aqui', 1), { ocorrencias: 2, citacoes_ids: [1] }, 'só até ao id pedido');
assert.equal(contar(fake, 'AQUI ALI', 4).ocorrencias, 1, 'insensível a maiúsculas');

const clone = () => JSON.parse(JSON.stringify(doc));
const refaz = (d) => { let ant = null; d.entradas.forEach((x, i) => { x.n = i + 1; x.anterior = ant; x.hash = hashDe(x); ant = x.hash; }); return d; };
let n = 0;
const falha = (nome, d, trecho, esp = espelho, cl = claude) => {
  const r = validar(d, esp, cl);
  assert.ok(r.some((x) => x.includes(trecho)), `estrago não apanhado (${nome}): ${JSON.stringify(r)}`);
  n++;
};
let d = clone(); d.format = 'x'; falha('format', d, 'format');
d = clone(); d.entradas = []; falha('sem entradas', d, 'sem entradas');
d = clone(); d.fronteira = 'Tudo.'; falha('sem fronteira', d, 'fronteira');
d = clone(); d.entradas[0].ora.pergunta = 'Outra pergunta, escrita depois?'; falha('entrada reescrita (hash antigo)', d, 'hash não bate');
d = clone(); d.entradas[0].anterior = 'x'.repeat(64); falha('ligação quebrada', d, 'ligação');
d = clone(); d.entradas[0].padrao.ocorrencias = 7; d = refaz(d); falha('contagem inventada', d, 'contagem');
d = clone(); d.entradas[0].padrao.citacoes_ids = [1, 2]; d = refaz(d); falha('citações do padrão inventadas', d, 'citações onde');
d = clone(); d.entradas[0].padrao.termo = ''; d = refaz(d); falha('padrão sem termo', d, 'sem termo');
d = clone(); d.entradas[0].ora.pergunta = 'Tu és uma pessoa que escreve muito aqui ali.'; d = refaz(d); falha('afirmação em vez de pergunta', d, 'acabar em ?');
d = clone(); d.entradas[0].ora.pergunta = 'Tu és um homem ansioso, não é?'; d = refaz(d); falha('diagnóstico', d, 'não sabe');
d = clone(); d.entradas[0].ora.pergunta = 'Sofres quando escreves aqui ali?'; d = refaz(d); falha('diz como Unum está', d, 'não sabe');
d = clone(); d.entradas[0].ora.pergunta = 'Queres receita garantida aqui ali?'; d = refaz(d); falha('promessa', d, 'promete');
d = clone(); d.entradas[0].ora.pergunta = 'a'.repeat(MAX_LINHA) + '?'; d = refaz(d); falha('pergunta longa demais', d, 'mais de');
d = clone(); d.entradas[0].ora.pergunta = 'Esta chave 0x' + 'a'.repeat(64) + ' diz-te algo?'; d = refaz(d); falha('segredo', d, 'segredo');
d = clone(); d.entradas[0].tipo = 'outra'; d = refaz(d); falha('tipo desconhecido', d, 'tipo desconhecido');
d = clone(); d.entradas.push({ n: 2, tipo: 'resposta', data: '2026-11-02', responde_a: 9, observador: { citacao: 'qualquer coisa', clausula: '## Oruming no espelho' }, anterior: null }); d = refaz(d); falha('resposta a pergunta que não existe', d, 'não existe antes');
d = clone(); d.entradas.push({ n: 2, tipo: 'resposta', data: '2026-11-02', responde_a: 1, observador: { citacao: 'Isto o Unum nunca escreveu', clausula: '## Oruming no espelho' }, anterior: null }); d = refaz(d); falha('resposta inventada', d, 'palavra por palavra');
d = clone(); d.entradas.push({ n: 2, tipo: 'resposta', data: '2026-11-02', responde_a: 1, observador: { citacao: 'x', clausula: '## Cláusula que não existe' }, anterior: null }); d = refaz(d); falha('cláusula inexistente', d, 'cláusula não existe');
d = clone(); d.entradas.push({ n: 2, tipo: 'pergunta', data: '2026-11-01', padrao: doc.entradas[0].padrao, ora: doc.entradas[0].ora, anterior: null }); d = refaz(d); falha('data para trás', d, 'data anterior');
// o espelho muda: uma citação nova depois do id pedido não altera a contagem (só acrescenta), mas uma citação antiga alterada, sim
const esp2 = JSON.parse(JSON.stringify(espelho)); esp2.citacoes.push({ id: 99, data: '2026-11-03', clausula: 'x', citacao: 'aqui ali aqui ali' });
assert.deepEqual(validar(doc, esp2, claude), [], 'citações novas não mexem nas contagens antigas');
const esp3 = JSON.parse(JSON.stringify(espelho)); esp3.citacoes.find((c) => c.id === 5).citacao = 'sem a expressão';
falha('citação antiga do espelho alterada', clone(), 'contagem', esp3);
falha('cláusula apagada do CLAUDE.md (resposta futura sem onde estar)', (() => { const x = clone(); x.entradas.push({ n: 2, tipo: 'resposta', data: '2026-11-02', responde_a: 1, observador: { citacao: 'o aqui e o ali', clausula: '## Oruming no espelho' }, anterior: null }); return refaz(x); })(), 'cláusula não existe', espelho, claude.replace('## Oruming no espelho', '## Outra coisa'));
console.log(`Oruming do espelho: ${doc.entradas.length} entrada(s) conferida(s), contagens refeitas, encadeadas por sha256; ${n} estragos propositados apanhados.`);
