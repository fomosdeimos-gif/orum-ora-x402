// Verifica a aritmética e a honestidade do funil de acessos de 27/10/2026 e que o próprio verificador apanha as mentiras:
// cada variante adulterada tem de falhar, a real tem de passar. Sem rede, sem base de dados.
// Unum, 27/10/2026: "Eu autorizo ORA", à proposta do funil de acessos só de leitura.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const fonte = JSON.parse(readFileSync(new URL('../economia/funil-acessos-2026-10-27.json', import.meta.url), 'utf8'));
const soma = (xs) => xs.reduce((a, b) => a + b, 0);

export function verificar(f) {
  const erros = [];
  const x = (m) => erros.push(m);
  const t = f.totais || {};
  if (t.nossos_provados + t.nao_nossos !== t.pedidos) x('nossos + não nossos não somam os pedidos');
  if (soma(Object.values(f.fases || {})) !== t.pedidos) x('as fases não somam os pedidos');
  const classes = Object.values(f.nao_nossos_por_classe || {});
  if (soma(classes.map((c) => c.pedidos)) !== t.nao_nossos) x('as classes de terceiros não somam os não nossos');
  const n = f.funil_de_origens_nao_nossas || {};
  if (!(n.receberam_402_de_consulta_browser_ou_agente <= n.receberam_402_browser_ou_agente_todas_as_portas)) x('as origens de consulta excedem as de todas as portas');
  if (!(n.receberam_402_browser_ou_agente_todas_as_portas <= n.receberam_402)) x('as origens browser/agente excedem as que receberam o 402');
  const s = f.sinais_de_pagamento || {};
  if (s.x402lint?.n + s.curl?.n !== s.total) x('os sinais de pagamento não somam o total');
  if (s.total !== (f.nao_nossos_por_classe?.x402_linter ? 5 : 0) + (s.curl?.n || 0)) x('o total de sinais não bate com o linter e o curl');
  if (typeof s.pagamentos_verificados_em_cadeia_na_janela !== 'number') x('falta a contagem de pagamentos verificados em cadeia');
  if (s.pagamentos_verificados_em_cadeia_na_janela > 0 && /sem pagamento externo/i.test(JSON.stringify(f))) x('afirma sem pagamento externo mas há pagamentos verificados');
  const w = f.janela || {};
  const r = f.regra_de_decisao_do_preco || {};
  if (r.medida_actual !== n.receberam_402_de_consulta_browser_ou_agente) x('a medida da regra não é a leitura de consulta');
  if (w.dia_da_janela_de_decisao < w.dias_da_janela_de_decisao && r.estado !== 'por decidir') x('a regra do preço não pode ser decidida antes de a janela acabar');
  if (w.dia_da_janela_de_decisao >= w.dias_da_janela_de_decisao && r.estado === 'por decidir') x('a janela acabou e a regra continua por decidir');
  if (!f.limites || f.limites.length < 3) x('faltam os limites');
  if (!/n[ãa]o prova procura/i.test(JSON.stringify(f.limites || []))) x('falta a fronteira "não prova procura"');
  // Textos públicos não prometem receita, reembolso nem procura.
  if (/\b(vai(?:m)? comprar|garant\w+ receita|receita garantida|reembols\w+ garant|procura confirmada)\b/i.test(JSON.stringify(f))) x('promessa de receita, reembolso ou procura');
  // Nunca guarda IPs em claro.
  if (/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(JSON.stringify(f))) x('um IP em claro no registo');
  if (!f.autorizacao_de_unum?.citacao) x('falta a citação de Unum');
  return erros;
}

assert.deepEqual(verificar(fonte), [], 'o registo real devia passar: ' + verificar(fonte).join('; '));

let mentiras = 0;
const clone = () => JSON.parse(JSON.stringify(fonte));
const falha = (nome, mexe) => { const c = clone(); mexe(c); assert.ok(verificar(c).length > 0, `devia falhar: ${nome}`); mentiras++; };

falha('nossos inflacionados', (c) => { c.totais.nossos_provados += 100; });
falha('fases que não somam', (c) => { c.fases.discovered += 1; });
falha('classe de terceiros alterada', (c) => { c.nao_nossos_por_classe.browser.pedidos += 5; });
falha('origens de consulta acima das de todas as portas', (c) => { c.funil_de_origens_nao_nossas.receberam_402_de_consulta_browser_ou_agente = 99; });
falha('browser/agente acima dos 402', (c) => { c.funil_de_origens_nao_nossas.receberam_402_browser_ou_agente_todas_as_portas = 999; });
falha('sinais de pagamento que não somam', (c) => { c.sinais_de_pagamento.total = 7; });
falha('medida da regra inventada', (c) => { c.regra_de_decisao_do_preco.medida_actual = 25; });
falha('regra decidida antes do fim', (c) => { c.regra_de_decisao_do_preco.estado = 'baixar consulta'; });
falha('sem pagamentos verificados medidos', (c) => { delete c.sinais_de_pagamento.pagamentos_verificados_em_cadeia_na_janela; });
falha('promessa de receita', (c) => { c.leitura += ' Receita garantida.'; });
falha('IP em claro', (c) => { c.limites.push('visto em 203.0.113.7'); });
falha('sem a fronteira de procura', (c) => { c.limites = c.limites.filter((l) => !/procura/i.test(l)).concat(['a', 'b']); });
falha('sem a citação de Unum', (c) => { delete c.autorizacao_de_unum.citacao; });

console.log(JSON.stringify({ verified: true, casos_de_mentira: mentiras }));
