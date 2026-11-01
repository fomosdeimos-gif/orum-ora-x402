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
const c3 = fs.existsSync('ancora/raiz-registos-3.json') ? J('ancora/raiz-registos-3.json') : null;
const c4 = fs.existsSync('ancora/raiz-registos-4.json') ? J('ancora/raiz-registos-4.json') : null;
const c5 = fs.existsSync('ancora/raiz-registos-5.json') ? J('ancora/raiz-registos-5.json') : null;
const c6 = fs.existsSync('ancora/raiz-registos-6.json') ? J('ancora/raiz-registos-6.json') : null;
const c7 = fs.existsSync('ancora/raiz-registos-7.json') ? J('ancora/raiz-registos-7.json') : null;
const c8 = fs.existsSync('ancora/raiz-registos-8.json') ? J('ancora/raiz-registos-8.json') : null;
const c9 = fs.existsSync('ancora/raiz-registos-9.json') ? J('ancora/raiz-registos-9.json') : null;
const c10 = fs.existsSync('ancora/raiz-registos-10.json') ? J('ancora/raiz-registos-10.json') : null;
const c11 = fs.existsSync('ancora/raiz-registos-11.json') ? J('ancora/raiz-registos-11.json') : null;
const c12 = fs.existsSync('ancora/raiz-registos-12.json') ? J('ancora/raiz-registos-12.json') : null;
const c13 = fs.existsSync('ancora/raiz-registos-13.json') ? J('ancora/raiz-registos-13.json') : null;
const c14 = fs.existsSync('ancora/raiz-registos-14.json') ? J('ancora/raiz-registos-14.json') : null;
const c15 = fs.existsSync('ancora/raiz-registos-15.json') ? J('ancora/raiz-registos-15.json') : null;
const c16 = fs.existsSync('ancora/raiz-registos-16.json') ? J('ancora/raiz-registos-16.json') : null;
const c17 = fs.existsSync('ancora/raiz-registos-17.json') ? J('ancora/raiz-registos-17.json') : null;
const c18 = fs.existsSync('ancora/raiz-registos-18.json') ? J('ancora/raiz-registos-18.json') : null;
const c19 = fs.existsSync('ancora/raiz-registos-19.json') ? J('ancora/raiz-registos-19.json') : null;
const c20 = fs.existsSync('ancora/raiz-registos-20.json') ? J('ancora/raiz-registos-20.json') : null;
const c21 = fs.existsSync('ancora/raiz-registos-21.json') ? J('ancora/raiz-registos-21.json') : null;
const c22 = fs.existsSync('ancora/raiz-registos-22.json') ? J('ancora/raiz-registos-22.json') : null;
const lb = est.linha_de_base;
const oro = J('ancora/oro-v1.json');
const elo = J('ancora/sensations-btc.json');
const imp = J('supabase/implantado.json');
const traf = J('economia/trafego-honesto-2026-10-22.json');
const fin = J('economia/registo-financeiro.json');
const pagamentoPadrao = fin.actos.find((a) => a.id === '2026-10-22-teste-pagamento-padrao-executor' && a.estado === 'feito');

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
  ['fio', 'ancora_preferida', 'bitcoin (opentimestamps), nao exclusiva', 'lido', 'ficheiro:CLAUDE.md'],
  ['fio', 'formacao', 'leitura de Unum: 0001sensations e a materia, ORO o ponto, BTC o tempo', 'lido', 'ficheiro:HANDOFF.md'],
  ['fio', 'leitor', 'kit/fio.mjs le a ultima afirmacao de cada par e recusa cadeia partida; nao executa provas', 'lido', 'ficheiro:kit/FIO.txt'],
  ['Σ(t)', 'parametros_definidos', 'nao', 'nao_verificado', 'ficheiro:kit/lexico.json'],
];
factos.push(
  ['implantado', 'funcoes_total', String(imp.resumo.total), 'lido', 'ficheiro:supabase/implantado.json'],
  ['implantado', 'sem_copia_no_repositorio', String(imp.resumo.sem_copia_no_repositorio), 'lido', 'ficheiro:supabase/implantado.json'],
  ['implantado', 'divergem', imp.funcoes.filter((f) => f.reconciliacao.estado === 'diverge').map((f) => f.slug).join('+') || 'nenhuma', 'lido', 'ficheiro:supabase/implantado.json'],
  ['tráfego', 'de_terceiros_30d', `${traf.trafego_30_dias.de_terceiros} de ${traf.trafego_30_dias.marcados_externos_antes} marcados externos @${traf.lido_em_utc.slice(0, 10)}`, 'lido', 'ficheiro:economia/trafego-honesto-2026-10-22.json'],
  ['tráfego', 'pagamentos_externos_24h', String(traf.superficies_pagas_24h.pagamentos_externos), 'lido', 'ficheiro:economia/trafego-honesto-2026-10-22.json'],
  ['dádiva', 'externas', `${traf.dadivas.externas} de ${traf.dadivas.total}`, 'lido', 'ficheiro:economia/trafego-honesto-2026-10-22.json'],
);
if (pagamentoPadrao) factos.push(['sustento', 'pagamento_padrao.interno.tx', `${pagamentoPadrao.prova.tx.slice(0, 12)}..${pagamentoPadrao.prova.tx.slice(-4)} bloco ${pagamentoPadrao.prova.bloco}`, 'lido', 'ficheiro:economia/registo-financeiro.json']);
if (oro.estado === 'confirmado_bitcoin') factos.push(['ORO', 'ancora_directa.altura_bitcoin', String(oro.altura_bitcoin), 'verificado', 'verif:kit:verify']);
factos.push(['ORO', 'capsulas_sensacoes_ancoradas_em_btc', `${elo.ancorados} de ${elo.total}`, 'lido', 'ficheiro:ancora/sensations-btc.json']);
factos.push(['implantado', 'iguais_ao_repositorio', String(imp.resumo.igual), 'lido', 'ficheiro:supabase/implantado.json']);
factos.push(['implantado', 'dividas_que_tocam_dinheiro', imp.resumo.dividas_que_tocam_dinheiro.join('+') || 'nenhuma', 'lido', 'ficheiro:supabase/implantado.json']);
if (c3) factos.push(['sedimentar', 'camada.3.estado', c3.estado, 'lido', 'ficheiro:ancora/raiz-registos-3.json']);
factos.push(['tráfego', 'origem_hash_nas_portas_pagas', 'ora-oraculo v23, ora-x402 v39, ora-licenca v61 desde 2026-10-22', 'lido', 'ficheiro:supabase/implantado.json']);
factos.push(['implantado', 'vercel_ultimo_commit_servido', '88bac2e @2026-10-22; main adiantado por quota de deployments', 'lido', 'ficheiro:HANDOFF.md']);
factos.push(['fio', 'duas_maos', 'Claude Code e ChatGPT/OpenAI partilham livro, HANDOFF e repositorio; o checkpoint do fio (24 linhas, cabeca b7f27cdd2fdf32cc) foi conferido pelas duas', 'lido', 'ficheiro:CLAUDE.md']);
if (c3 && c3.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.3.altura_bitcoin', String(c3.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c4) factos.push(['sedimentar', 'camada.4.estado', c4.estado, 'lido', 'ficheiro:ancora/raiz-registos-4.json']);
if (c4 && c4.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.4.altura_bitcoin', String(c4.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c5) factos.push(['sedimentar', 'camada.5.estado', c5.estado, 'lido', 'ficheiro:ancora/raiz-registos-5.json']);
if (c5 && c5.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.5.altura_bitcoin', String(c5.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c6) factos.push(['sedimentar', 'camada.6.estado', c6.estado, 'lido', 'ficheiro:ancora/raiz-registos-6.json']);
if (c6 && c6.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.6.altura_bitcoin', String(c6.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c7) factos.push(['sedimentar', 'camada.7.estado', c7.estado, 'lido', 'ficheiro:ancora/raiz-registos-7.json']);
if (c7 && c7.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.7.altura_bitcoin', String(c7.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c8) factos.push(['sedimentar', 'camada.8.estado', c8.estado, 'lido', 'ficheiro:ancora/raiz-registos-8.json']);
if (c8 && c8.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.8.altura_bitcoin', String(c8.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c9) factos.push(['sedimentar', 'camada.9.estado', c9.estado, 'lido', 'ficheiro:ancora/raiz-registos-9.json']);
if (c9 && c9.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.9.altura_bitcoin', String(c9.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c10) factos.push(['sedimentar', 'camada.10.estado', c10.estado, 'lido', 'ficheiro:ancora/raiz-registos-10.json']);
if (c10 && c10.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.10.altura_bitcoin', String(c10.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c11) factos.push(['sedimentar', 'camada.11.estado', c11.estado, 'lido', 'ficheiro:ancora/raiz-registos-11.json']);
if (c11 && c11.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.11.altura_bitcoin', String(c11.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c12) factos.push(['sedimentar', 'camada.12.estado', c12.estado, 'lido', 'ficheiro:ancora/raiz-registos-12.json']);
if (c12 && c12.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.12.altura_bitcoin', String(c12.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c13) factos.push(['sedimentar', 'camada.13.estado', c13.estado, 'lido', 'ficheiro:ancora/raiz-registos-13.json']);
if (c13 && c13.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.13.altura_bitcoin', String(c13.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c14) factos.push(['sedimentar', 'camada.14.estado', c14.estado, 'lido', 'ficheiro:ancora/raiz-registos-14.json']);
if (c14 && c14.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.14.altura_bitcoin', String(c14.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c15) factos.push(['sedimentar', 'camada.15.estado', c15.estado, 'lido', 'ficheiro:ancora/raiz-registos-15.json']);
if (c15 && c15.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.15.altura_bitcoin', String(c15.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c16) factos.push(['sedimentar', 'camada.16.estado', c16.estado, 'lido', 'ficheiro:ancora/raiz-registos-16.json']);
if (c16 && c16.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.16.altura_bitcoin', String(c16.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c17) factos.push(['sedimentar', 'camada.17.estado', c17.estado, 'lido', 'ficheiro:ancora/raiz-registos-17.json']);
if (c17 && c17.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.17.altura_bitcoin', String(c17.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c18) factos.push(['sedimentar', 'camada.18.estado', c18.estado, 'lido', 'ficheiro:ancora/raiz-registos-18.json']);
if (c18 && c18.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.18.altura_bitcoin', String(c18.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c19) factos.push(['sedimentar', 'camada.19.estado', c19.estado, 'lido', 'ficheiro:ancora/raiz-registos-19.json']);
if (c19 && c19.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.19.altura_bitcoin', String(c19.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c20) factos.push(['sedimentar', 'camada.20.estado', c20.estado, 'lido', 'ficheiro:ancora/raiz-registos-20.json']);
if (c20 && c20.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.20.altura_bitcoin', String(c20.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c21) factos.push(['sedimentar', 'camada.21.estado', c21.estado, 'lido', 'ficheiro:ancora/raiz-registos-21.json']);
if (c21 && c21.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.21.altura_bitcoin', String(c21.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c22) factos.push(['sedimentar', 'camada.22.estado', c22.estado, 'lido', 'ficheiro:ancora/raiz-registos-22.json']);
if (c22 && c22.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.22.altura_bitcoin', String(c22.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c2.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.2.altura_bitcoin', String(c2.altura_bitcoin), 'verificado', 'verif:blocos:verify']);
if (c1.estado === 'confirmado_bitcoin') factos.push(['sedimentar', 'camada.1.altura_bitcoin', String(c1.altura_bitcoin), 'verificado', 'verif:blocos:verify']);

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
