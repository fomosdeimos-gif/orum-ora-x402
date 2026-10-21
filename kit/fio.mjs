// Leitor do fio: da cadeia ORUM-linhas tira o que vale hoje (a última afirmação de cada sujeito e predicado)
// e o que já foi dito antes. Não executa provas: diz o que cada linha afirma e com que estado.
// Uso: node kit/fio.mjs [sujeito] [pasta-do-repositório]   (especificação: kit/FIO.txt)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ler, validar, contexto, ligacao, ZERO } from './linhas.mjs';

// Recusa uma cadeia que não passa em ORUM-linhas: um fio partido não se lê como se estivesse inteiro.
export function fio(texto, ctx) {
  const erros = validar(texto, ctx);
  if (erros.length) throw new Error('a cadeia não está inteira: ' + erros.join('; '));
  const ls = ler(texto);
  const mapa = new Map();
  for (const l of ls) {
    const k = `${l.sujeito}\u0000${l.predicado}`;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(l);
  }
  const afirmacoes = [...mapa.values()].map((h) => {
    const u = h.at(-1);
    return {
      sujeito: u.sujeito, predicado: u.predicado, valor: u.valor, estado: u.estado, prova: u.prova, quando: u.quando,
      vezes: h.length, antes: h.slice(0, -1).map((a) => ({ quando: a.quando, valor: a.valor, estado: a.estado })),
    };
  });
  return { linhas: ls.length, cabeca: ls.length ? ligacao(ls.at(-1).linha) : ZERO, afirmacoes };
}

export function lerFio(dir = '.', sujeito = null) {
  const texto = fs.readFileSync(path.join(dir, 'linhas/orum.linhas'), 'utf8');
  const r = fio(texto, contexto(dir));
  if (sujeito) r.afirmacoes = r.afirmacoes.filter((a) => a.sujeito === sujeito);
  return r;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [sujeito, dir] = process.argv.slice(2);
    const r = lerFio(dir ?? '.', sujeito ?? null);
    console.log(`cabeça ${r.cabeca} · ${r.linhas} linhas`);
    for (const a of r.afirmacoes) console.log(`${a.estado.padEnd(14)} ${a.sujeito} · ${a.predicado} = ${a.valor}${a.vezes > 1 ? `  (dito ${a.vezes}x)` : ''}`);
  } catch (err) { console.error(err.message); process.exit(1); }
}
