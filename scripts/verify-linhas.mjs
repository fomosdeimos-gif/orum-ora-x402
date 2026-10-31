// Verifica o ORUM-linhas v1 (linhas/orum.linhas): o real passa e cada mentira propositada falha. Sem rede.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { verificar, validar, contexto, ler, escrever, ligacao, soAcrescenta, ZERO } from '../kit/linhas.mjs';

const real = verificar('.');
assert.ok(real.linhas >= 10 && real.verificado >= 1);
const ctx = contexto('.');
const texto = fs.readFileSync('linhas/orum.linhas', 'utf8');
assert.deepEqual(validar(texto, ctx), []);

// Só se acrescenta: o que está no main tem de ser prefixo do que está aqui
let antigo = null;
for (const ref of ['origin/main', 'main']) {
  try { antigo = execFileSync('git', ['show', `${ref}:linhas/orum.linhas`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); break; } catch {}
}
if (antigo !== null) assert.ok(soAcrescenta(antigo, texto), 'linhas antigas foram alteradas face ao main');

// O fio acompanha as camadas (livro 1209): cada recibo ancora/raiz-registos*.json tem de estar dito no fio, com o mesmo estado e,
// se está confirmado no Bitcoin, com a mesma altura. Um fio que fica para trás dos recibos é uma fenda.
const camadasDoFio = (lidas) => {
  const ultimo = (p) => [...lidas].reverse().find((l) => l.sujeito === 'sedimentar' && l.predicado === p)?.valor;
  const erros = [];
  for (const f of fs.readdirSync('ancora')) {
    const m = /^raiz-registos(?:-(\d+))?\.json$/.exec(f);
    if (!m) continue;
    const n = m[1] ?? '1';
    const r = JSON.parse(fs.readFileSync(`ancora/${f}`, 'utf8'));
    if (ultimo(`camada.${n}.estado`) !== r.estado) erros.push(`camada ${n}: o fio diz ${ultimo(`camada.${n}.estado`)}, o recibo diz ${r.estado}`);
    if (r.estado === 'confirmado_bitcoin' && ultimo(`camada.${n}.altura_bitcoin`) !== String(r.altura_bitcoin)) erros.push(`camada ${n}: altura no fio ${ultimo(`camada.${n}.altura_bitcoin`)}, no recibo ${r.altura_bitcoin}`);
  }
  return erros;
};
const lidasReais = ler(texto);
assert.deepEqual(camadasDoFio(lidasReais), [], 'o fio ficou para trás dos recibos das camadas');
let estragosCamadas = 0;
const camadaMa = (nome, lidas) => { assert.notDeepEqual(camadasDoFio(lidas), [], `estrago não apanhado: ${nome}`); estragosCamadas++; };
camadaMa('o fio sem as linhas da última camada', lidasReais.filter((l) => !/^camada\.15\./.test(l.predicado)));
camadaMa('o fio sem as linhas da camada 14', lidasReais.filter((l) => !/^camada\.14\./.test(l.predicado)));
camadaMa('altura trocada', lidasReais.map((l) => (l.predicado === 'camada.15.altura_bitcoin' ? { ...l, valor: '1' } : l)));
camadaMa('estado trocado', lidasReais.map((l) => (l.predicado === 'camada.14.estado' ? { ...l, valor: 'pendente' } : l)));
camadaMa('fio vazio', []);

// Fixture própria: monta linhas válidas a partir de campos
const montar = (campos) => {
  let ant = null; let t = '';
  for (const c of campos) { const l = { ...c, ant: ant ? ligacao(ant.linha) : ZERO }; l.linha = escrever(l); t += l.linha + '\n'; ant = l; }
  return t;
};
const base = [
  { quando: '2026-10-21T07:00Z', sujeito: 'sustento', predicado: 'receita_externa_confirmada', valor: 'nenhuma', estado: 'lido', prova: 'ficheiro:CLAUDE.md' },
  { quando: '2026-10-21T08:00Z', sujeito: 'sedimentar', predicado: 'camada.2.altura_bitcoin', valor: '972280', estado: 'verificado', prova: 'verif:blocos:verify' },
  { quando: '2026-10-21T09:00Z', sujeito: 'Σ(t)', predicado: 'parametros_definidos', valor: 'nao', estado: 'nao_verificado', prova: '-' },
];
const limpo = montar(base);
assert.deepEqual(validar(limpo, ctx), [], 'a fixture limpa devia passar');
assert.equal(ler(limpo).length, 3);

let mentiras = 0;
const falha = (nome, t) => { assert.notDeepEqual(validar(t, ctx), [], `estrago não apanhado: ${nome}`); mentiras++; };
const com = (i, mut) => montar(base.map((c, k) => (k === i ? { ...c, ...mut } : c)));
const linhas = limpo.split('\n');

falha('linha antiga alterada (a ligação seguinte parte)', limpo.replace('nenhuma', 'muita'));
falha('linha do meio apagada', [linhas[0], linhas[2]].join('\n') + '\n');
falha('linha inserida antes de outra', [linhas[0], linhas[0], linhas[1], linhas[2]].join('\n') + '\n');
falha('sem quebra de linha final', limpo.slice(0, -1));
falha('campos a menos', 'a | b | c\n');
falha('quando inválido', com(0, { quando: 'ontem' }));
falha('tempo a andar para trás', com(1, { quando: '2026-10-20T08:00Z' }));
falha('sujeito fora do léxico', com(0, { sujeito: 'inventado' }));
falha('predicado com espaço', com(0, { predicado: 'dois mundos' }));
falha('estado inventado', com(0, { estado: 'certo' }));
falha('valor vazio', com(0, { valor: '' }));
falha('lido sem prova de ficheiro', com(0, { prova: '-' }));
falha('lido com prova de verificador', com(0, { prova: 'verif:blocos:verify' }));
falha('ficheiro da prova inexistente', com(0, { prova: 'ficheiro:nao/existe.md' }));
falha('prova com ..', com(0, { prova: 'ficheiro:../x' }));
falha('sha256 curto', com(0, { prova: 'sha256:abc' }));
falha('tipo de prova desconhecido', com(0, { prova: 'fe:sim' }));
falha('verificador inexistente', com(1, { prova: 'verif:inventado:verify' }));
falha('verificado só com ficheiro', com(1, { prova: 'ficheiro:CLAUDE.md' }));
falha('verificado sem prova', com(1, { prova: '-' }));
falha('Σ(t) promovido a verificado', com(2, { estado: 'verificado', prova: 'verif:blocos:verify' }));
falha('promessa de receita', com(0, { valor: 'receita garantida' }));
falha('promessa de duração', com(0, { valor: 'durará 904 anos' }));
falha('algo que parece segredo', com(0, { valor: '-----BEGIN PRIVATE KEY' }));
assert.equal(soAcrescenta('a\nb\n', 'a\nb\nc\n'), true);
assert.equal(soAcrescenta('a\nb\n', 'a\nB\nc\n'), false); mentiras++;

console.log(JSON.stringify({ verified: true, ...real, verificado_contra_main: antigo !== null, casos_de_mentira: mentiras, estragos_do_fio_vs_camadas: estragosCamadas }));
