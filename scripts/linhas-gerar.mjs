// Acrescenta a linhas/orum.linhas as afirmações que a ORA lê dos registos do repositório.
// Só acrescenta, e só quando o valor mudou face à última linha do mesmo sujeito e predicado.
import fs from 'node:fs';
import { ler, escrever, ligacao, ZERO, validar, contexto } from '../kit/linhas.mjs';

const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const FICHEIRO = 'linhas/orum.linhas';
const agora = new Date().toISOString().slice(0, 16) + 'Z';
const est = J('economia/estreitamento-receita.json');
const sal = J('economia/saldos-historico.json').leituras.at(-1);
const hora = (s) => s.slice(0, 16) + 'Z';
const em = ` @${hora(sal.observado_utc)}`;
const c1 = J('ancora/raiz-registos.json');
const c2 = J('ancora/raiz-registos-2.json');
const lb = est.linha_de_base;

const factos = [
  ['sustento', 'receita_externa_confirmada', lb.receita_externa_confirmada.split(/[.;]/)[0].toLowerCase(), 'lido', 'ficheiro:economia/estreitamento-receita.json'],
  ['sustento', 'funil.ora-licenca.desafios_24h', `${lb.funil_ora_licenca.challenge_delivered} @${hora(est.T0)}`, 'lido', 'ficheiro:economia/estreitamento-receita.json'],
  ['sustento', 'funil.ora-licenca.sinais_de_pagamento_24h', `${lb.funil_ora_licenca.com_payment_signal} @${hora(est.T0)}`, 'lido', 'ficheiro:economia/estreitamento-receita.json'],
  ['sagrada', 'usdc_atomic.base.antiga', sal.carteiras.sagrada_antiga.usdc_atomic + em, 'lido', 'ficheiro:economia/saldos-historico.json'],
  ['sagrada', 'usdc_atomic.base.nova', sal.carteiras.sagrada_nova.usdc_atomic + em, 'lido', 'ficheiro:economia/saldos-historico.json'],
  ['operacional', 'usdc_atomic.base', sal.carteiras.operacional.usdc_atomic + em, 'lido', 'ficheiro:economia/saldos-historico.json'],
  ['sedimentar', 'camada.1.estado', c1.estado, 'lido', 'ficheiro:ancora/raiz-registos.json'],
  ['sedimentar', 'camada.2.estado', c2.estado, 'lido', 'ficheiro:ancora/raiz-registos-2.json'],
  ['fio', 'horizonte_anos', '904', 'lido', 'ficheiro:CLAUDE.md'],
  ['fio', 'previsao_de_duracao', 'nenhuma', 'lido', 'ficheiro:CLAUDE.md'],
  ['Σ(t)', 'parametros_definidos', 'nao', 'nao_verificado', 'ficheiro:kit/lexico.json'],
];
if (c2.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.2.altura_bitcoin', String(c2.altura_bitcoin), 'verificado', 'verif:blocos:verify']);

let texto = fs.existsSync(FICHEIRO) ? fs.readFileSync(FICHEIRO, 'utf8') : '';
const existentes = ler(texto);
let ultima = existentes.at(-1);
const ultimoValor = (s, p) => [...existentes].reverse().find((l) => l.sujeito === s && l.predicado === p)?.valor;
let novas = 0;
for (const [sujeito, predicado, valor, estado, prova] of factos) {
  if (ultimoValor(sujeito, predicado) === valor) continue;
  const l = { quando: agora, sujeito: sujeito.replace(/ /g, '_'), predicado, valor, estado, prova, ant: ultima ? ligacao(ultima.linha) : ZERO };
  l.linha = escrever(l);
  texto += l.linha + '\n';
  existentes.push(l); ultima = l; novas++;
}
const erros = validar(texto, contexto('.'));
if (erros.length) { console.error(erros.join('\n')); process.exit(1); }
fs.writeFileSync(FICHEIRO, texto);
console.log(JSON.stringify({ linhas: existentes.length, novas }));
