// Verifica economia/pedidos-aos-servicos.json: coerência dos números, a regra de verdade (nenhuma receita ou procura afirmada sem
// pagador externo confirmado) e as lacunas ditas. Sem rede. Cada mentira testada aqui tem de falhar.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const CAMINHO = 'economia/pedidos-aos-servicos.json';
const PROIBIDO = /\b(h[aá] procura|existe procura|procura confirmada|adop[cç][aã]o confirmada|receita confirmada de)\b/i;

export function validar(m) {
  const e = [];
  if (m.schema !== 'orum-pedidos-aos-servicos/v1') e.push('schema inesperado');
  const l = m.leitura ?? {};
  const pg = l.pagamentos_verificados_onchain ?? {};
  const soma = (pg.por_classificacao ?? []).reduce((s, x) => s + x.pagamentos, 0);
  if (soma !== pg.total) e.push(`pagamentos por classificação (${soma}) não somam o total (${pg.total})`);
  const externos = (pg.por_classificacao ?? []).filter((x) => x.classificacao !== 'interno').reduce((s, x) => s + x.pagamentos, 0);
  if (externos !== pg.externos_confirmados) e.push(`externos_confirmados (${pg.externos_confirmados}) não bate com as classificações (${externos})`);
  if ((l.receita_externa_confirmada > 0) !== (externos > 0)) e.push('receita_externa_confirmada incoerente com os pagadores externos');
  const serie = l.serie_diaria_externa ?? [];
  if (!serie.length) e.push('sem série diária');
  for (let i = 0; i < serie.length; i++) {
    const x = serie[i];
    if (!(x.linhas >= 0) || !(x.origens >= 0)) e.push(`valor negativo ou em falta em ${x.dia}`);
    if (x.origens > x.linhas) e.push(`mais origens que linhas em ${x.dia}`);
    if (i && !(serie[i - 1].dia < x.dia)) e.push(`série fora de ordem em ${x.dia}`);
  }
  const v = (m.fontes ?? []).find((f) => f.id === 'vercel-runtime-logs');
  if (!v || !/1 hora/.test(v.limite ?? '')) e.push('falta dizer o limite de 1 hora dos registos do Vercel');
  const logsTotal = Object.values(v?.lido?.['ora-x402-gateway'] ?? {}).reduce((s, n) => s + n, 0);
  if (v && (v.pedidos_a_oraculo_ou_campo !== 0 || Object.keys(v.lido?.['ora-x402-gateway'] ?? {}).some((p) => /oraculo|campo/.test(p)))) {
    if (v.pedidos_a_oraculo_ou_campo === 0) e.push('pedidos_a_oraculo_ou_campo a 0 mas há caminhos oraculo/campo lidos');
  }
  if (!(logsTotal >= 0)) e.push('contagem dos registos inválida');
  const d = m.via_directa;
  if (d) {
    const classes = Object.values(d.plausiveis_por_classe ?? {}).reduce((s, n) => s + n, 0);
    const vias = Object.values(d.plausiveis_por_via ?? {}).reduce((s, n) => s + n, 0);
    if (d.linhas_total !== d.linhas_estado_implausivel_290_a_299 + d.linhas_plausiveis) e.push('via_directa: total não soma implausíveis e plausíveis');
    if (classes !== d.linhas_plausiveis) e.push('via_directa: as classes não somam as linhas plausíveis');
    if (vias !== d.linhas_plausiveis) e.push('via_directa: as vias não somam as linhas plausíveis');
    if (d.fora_o_periodico !== d.linhas_plausiveis - (d.plausiveis_por_classe?.outro ?? 0)) e.push('via_directa: fora_o_periodico não bate com as classes');
    if (!/n[aã]o prova procura/i.test(d.nao_prova ?? '')) e.push('via_directa: nao_prova tem de dizer que não prova procura');
    if (!/n[aã]o fi[aá]ve/i.test(d.nota_implausiveis ?? '')) e.push('via_directa: falta dizer que as linhas implausíveis não são fiáveis');
  }
  if (!/n[aã]o prova procura/i.test(m.nao_prova ?? '')) e.push('nao_prova tem de dizer que não prova procura');
  if (!Array.isArray(m.lacunas) || m.lacunas.length === 0) e.push('sem lacunas');
  if (!Array.isArray(m.nao_verificado) || m.nao_verificado.length === 0) e.push('sem nao_verificado');
  if (!/ora_acessos_log/.test(m.sql_reproduz ?? '')) e.push('sql_reproduz em falta');
  const textos = JSON.stringify(m);
  const p = textos.match(PROIBIDO);
  if (p) e.push(`promessa ou afirmação proibida: ${p[0]}`);
  return e;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const m = JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));
  assert.deepEqual(validar(m), [], 'a leitura real tem de passar');
  const clone = () => JSON.parse(JSON.stringify(m));
  let n = 0;
  const falha = (nome, x, trecho) => { const r = validar(x); assert.ok(r.some((s) => s.includes(trecho)), `estrago não apanhado (${nome}): ${JSON.stringify(r)}`); n++; };
  let x = clone(); x.schema = 'x'; falha('schema', x, 'schema');
  x = clone(); x.leitura.pagamentos_verificados_onchain.total = 23; falha('total não soma', x, 'não somam');
  x = clone(); x.leitura.pagamentos_verificados_onchain.por_classificacao.push({ classificacao: 'externo', pagamentos: 1, pagadores: 1 }); x.leitura.pagamentos_verificados_onchain.total = 23; falha('externo escondido', x, 'externos_confirmados');
  x = clone(); x.leitura.receita_externa_confirmada = 5; falha('receita sem pagador externo', x, 'receita_externa_confirmada');
  x = clone(); x.via_directa.linhas_total = 999; falha('via directa total', x, 'total não soma');
  x = clone(); x.via_directa.plausiveis_por_classe.outro = 1; falha('via directa classes', x, 'classes não somam');
  x = clone(); x.via_directa.fora_o_periodico = 1; falha('via directa fora do periódico', x, 'fora_o_periodico');
  x = clone(); x.via_directa.nota_implausiveis = 'tudo certo'; falha('via directa implausíveis escondidos', x, 'não são fiáveis');
  x = clone(); x.via_directa.nao_prova = 'Mostra interesse.'; falha('via directa nao_prova', x, 'via_directa: nao_prova');
  x = clone(); x.leitura.serie_diaria_externa[2].origens = 9999; falha('origens > linhas', x, 'mais origens que linhas');
  x = clone(); [x.leitura.serie_diaria_externa[0], x.leitura.serie_diaria_externa[1]] = [x.leitura.serie_diaria_externa[1], x.leitura.serie_diaria_externa[0]]; falha('série desordenada', x, 'fora de ordem');
  x = clone(); x.fontes[0].limite = 'sem limite'; falha('limite escondido', x, 'limite de 1 hora');
  x = clone(); x.nao_prova = 'Mostra o interesse.'; falha('nao_prova sem fronteira', x, 'nao_prova');
  x = clone(); x.lacunas = []; falha('sem lacunas', x, 'sem lacunas');
  x = clone(); x.nao_verificado = []; falha('sem nao_verificado', x, 'sem nao_verificado');
  x = clone(); x.sql_reproduz = ''; falha('sem sql', x, 'sql_reproduz');
  x = clone(); x.o_que_se_le.push('Existe procura confirmada pelos serviços.'); falha('promessa de procura', x, 'proibida');
  console.log(`Pedidos aos serviços: leitura conferida; ${n} estragos propositados apanhados.`);
}
