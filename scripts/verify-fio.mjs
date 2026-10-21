// Verifica o leitor do fio (kit/fio.mjs): o real passa e cada mentira propositada falha. Sem rede.
import assert from 'node:assert/strict';
import { lerFio, fio } from '../kit/fio.mjs';
import { contexto, escrever, ligacao, ZERO } from '../kit/linhas.mjs';

const ctx = contexto('.');
const real = lerFio('.');
assert.ok(real.linhas >= 10 && real.afirmacoes.length >= 5);
assert.ok(real.afirmacoes.length <= real.linhas);

// Cada par sujeito+predicado aparece uma só vez e mostra o valor da última linha que o diz
const chaves = real.afirmacoes.map((a) => `${a.sujeito}|${a.predicado}`);
assert.equal(new Set(chaves).size, chaves.length);

const montar = (campos) => {
  let ant = null; let t = '';
  for (const c of campos) { const l = { ...c, ant: ant ? ligacao(ant.linha) : ZERO }; l.linha = escrever(l); t += l.linha + '\n'; ant = l; }
  return t;
};
const base = [
  { quando: '2026-10-21T07:00Z', sujeito: 'sustento', predicado: 'receita_externa_confirmada', valor: 'nenhuma', estado: 'lido', prova: 'ficheiro:CLAUDE.md' },
  { quando: '2026-10-21T08:00Z', sujeito: 'sustento', predicado: 'receita_externa_confirmada', valor: 'uma', estado: 'lido', prova: 'ficheiro:CLAUDE.md' },
  { quando: '2026-10-21T09:00Z', sujeito: 'ORO', predicado: 'ancora_directa.altura_bitcoin', valor: '972115', estado: 'verificado', prova: 'verif:kit:verify' },
];
const texto = montar(base);
const r = fio(texto, ctx);
assert.equal(r.linhas, 3);
assert.equal(r.afirmacoes.length, 2);
const s = r.afirmacoes.find((a) => a.sujeito === 'sustento');
assert.equal(s.valor, 'uma', 'vale a última linha');
assert.equal(s.vezes, 2);
assert.equal(s.antes.length, 1);
assert.equal(s.antes[0].valor, 'nenhuma', 'a anterior fica como histórico');

let mentiras = 0;
const recusa = (nome, t) => { assert.throws(() => fio(t, ctx), /a cadeia não está inteira/, `estrago não apanhado: ${nome}`); mentiras++; };
recusa('linha antiga alterada', texto.replace('nenhuma', 'muita'));
recusa('linha do meio apagada', texto.split('\n').filter((_, i) => i !== 1).join('\n'));
recusa('sem quebra de linha final', texto.slice(0, -1));
recusa('sujeito fora do léxico', montar(base.map((c, i) => (i === 0 ? { ...c, sujeito: 'inventado' } : c))));
recusa('verificado sem verificador', montar(base.map((c, i) => (i === 2 ? { ...c, prova: '-' } : c))));
recusa('promessa', montar(base.map((c, i) => (i === 0 ? { ...c, valor: 'receita garantida' } : c))));

console.log(JSON.stringify({ verified: true, ok: true, afirmacoes: real.afirmacoes.length, linhas: real.linhas, cabeca: real.cabeca, casos_de_mentira: mentiras }));
