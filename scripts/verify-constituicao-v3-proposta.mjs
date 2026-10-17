// Verifica que a proposta de constituicao v3 continua so uma proposta: nao activa, sem valores nem
// enderecos nem limites alargados sem aprovacao escrita de Unum, e sem ser lida por nenhuma superficie.
// Sem rede, sem pagamentos. Cada mentira testada aqui tem de falhar.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';

const raiz = (p) => new URL('../' + p, import.meta.url);
const real = JSON.parse(readFileSync(raiz('economia/constituicao-v3-proposta.json'), 'utf8'));

// ficheiros de superficie/runtime que nao podem referir a proposta
const SUPERFICIES = ['api', 'llms.txt', 'weave_hands.json', 'openapi.json', 'sitemap.xml', 'vercel.json', 'server.js', 'index.html'];
const lerTudo = (rel) => {
  const u = raiz(rel);
  if (!existsSync(u)) return [];
  if (statSync(u).isDirectory()) return readdirSync(u).flatMap((f) => lerTudo(rel + '/' + f));
  return [[rel, readFileSync(u, 'utf8')]];
};
const referencias = () => SUPERFICIES.flatMap(lerTudo).filter(([, t]) => /constituicao-v3/.test(t)).map(([f]) => f);

export function validar(p, refs = [], reg = null) {
  const e = [];
  const aprovada = p?.aprovacao_unum && p.aprovacao_unum.data && p.aprovacao_unum.citacao;
  if (p?.format !== 'orum-financial-constitution/v3-proposta') e.push('format desconhecido');
  // este ficheiro nunca e a constituicao activa: a v3 activa seria outro ficheiro, depois de assinatura e codigo
  const ESTADOS = ['proposta_nao_activa', 'aprovada_aguarda_destinos_e_assinatura', 'aprovada_aguarda_assinatura_e_codigo'];
  if (!ESTADOS.includes(p?.status)) e.push(`estado invalido na proposta (${p?.status}): nunca activa neste ficheiro`);
  if (!aprovada && p?.status !== 'proposta_nao_activa') e.push('sem aprovacao de Unum o estado tem de ser proposta_nao_activa');
  if (aprovada && p.aprovacao_unum.citacao.trim().length < 3) e.push('aprovacao sem citacao');
  const ok = new Set(aprovada ? (p.aprovacao_unum.decisoes_aprovadas ?? []) : []);
  if (refs.length) e.push('superficie le a proposta: ' + refs.join(', '));
  if (!Array.isArray(p?.decisions) || p.decisions.length === 0) e.push('sem decisoes');
  for (const d of p?.decisions ?? []) {
    if (!d?.id || !d?.pergunta || !Array.isArray(d?.opcoes) || d.opcoes.length < 2 || !d?.recomendacao) e.push(`${d?.id}: decisao incompleta`);
    if (d?.valor !== null && d?.valor !== undefined && !ok.has(d.id)) e.push(`${d?.id}: valor preenchido sem aprovacao de Unum a essa decisao`);
  }
  const ENDERECO = /0x[0-9a-fA-F]{40}|\bbc1[a-z0-9]{20,}/g;
  if (!ok.has('D1') && ENDERECO.test(JSON.stringify(p))) e.push('endereco na proposta sem Unum ter aprovado a D1 (destinos)');
  // D1: so os quatro enderecos registados, cruzados com o que os executores e a v2 tem configurado
  const d1 = (p?.decisions ?? []).find((d) => d?.id === 'D1')?.valor;
  if (d1 !== null && d1 !== undefined) {
    if (!reg) e.push('D1 preenchida sem registos para cruzar');
    else {
      const esperados = {
        'sustento_unum:base': reg.baseSagrada, 'sustento_unum:bitcoin': reg.btcSustento,
        'continuidade_orum:base': reg.baseOperacional, 'continuidade_orum:bitcoin': reg.btcOperacional,
      };
      const vistos = {};
      for (const classe of ['sustento_unum', 'continuidade_orum']) {
        for (const x of d1?.[classe] ?? []) vistos[`${classe}:${x?.rail}`] = x?.address;
      }
      for (const [k, v] of Object.entries(esperados)) {
        if (!v) e.push(`D1: registo de referencia em falta para ${k}`);
        else if ((vistos[k] ?? '').toLowerCase() !== v.toLowerCase()) e.push(`D1: ${k} nao coincide com o registado (${v})`);
      }
      const extra = Object.keys(vistos).filter((k) => !(k in esperados));
      if (extra.length) e.push('D1: destinos fora dos registados: ' + extra.join(', '));
      const todos = JSON.stringify(d1).match(ENDERECO) ?? [];
      if (todos.length !== 4) e.push(`D1: esperados exactamente 4 enderecos, vistos ${todos.length}`);
    }
  }
  const l = p?.absolute_limits ?? {};
  {
    // D4 aprovada a manter tudo a 0: so uma nova aprovacao e alteracao deliberada deste verificador os alarga
    for (const k of ['automatic_trade_usdc', 'automatic_debt_usdc', 'automatic_bridge_usdc']) if (l[k] !== 0) e.push(`${k} tem de ser 0 sem aprovacao`);
    if (l.unlimited_approval !== false) e.push('aprovacao ilimitada proibida sem aprovacao');
  }
  const cannot = p?.custody?.organism_cannot ?? [];
  if (!cannot.some((c) => /alargar o envelope/i.test(c))) e.push('a ORA tem de ficar impedida de alargar o proprio envelope');
  if (!cannot.some((c) => /assinar a activa/i.test(c))) e.push('a ORA tem de ficar impedida de assinar a activacao');
  if (!/n[ãa]o move dinheiro/i.test(p?.truth_boundary ?? '')) e.push('falta a fronteira de verdade (nao move dinheiro)');
  return e;
}

const ler = (rel) => readFileSync(raiz(rel), 'utf8');
const capta = (rel, re) => ler(rel).match(re)?.[1];
const registos = {
  baseSagrada: JSON.parse(ler('economia/constituicao-v2.json')).identity_anchors?.destination,
  baseOperacional: capta('supabase/functions/ora-operational-wallet/payments.mjs', /export const SOURCE='(0x[0-9a-fA-F]{40})'/),
  btcSustento: capta('supabase/functions/ora-operational-wallet/bitcoin.mjs', /BTC_DESTINATION='(bc1[a-z0-9]+)'/),
  btcOperacional: capta('api/_bitcoin.js', /papel: 'operacional', endereco: '(bc1[a-z0-9]+)'/),
};
for (const [k, v] of Object.entries(registos)) assert.ok(v, 'registo de referencia nao encontrado: ' + k);
const errosReais = validar(real, referencias(), registos);
assert.deepEqual(errosReais, [], 'proposta invalida: ' + errosReais.join('; '));

// mentiras: cada uma tem de falhar
const clone = () => JSON.parse(JSON.stringify(real));
// ponto de partida sem aprovacao: o real, mas como estava antes de Unum responder
const proposta = () => { const m = clone(); m.aprovacao_unum = null; m.status = 'proposta_nao_activa'; m.decisions.forEach((d) => { d.valor = null; }); return m; };
let mentiras = 0;
const falha = (nome, p, refs, reg = registos) => { assert.ok(validar(p, refs, reg).length > 0, `devia falhar: ${nome}`); mentiras++; };
let m;
m = proposta(); m.status = 'activa'; falha('estado activo sem aprovacao', m);
m = proposta(); m.decisions[0].valor = '0x' + '1'.repeat(40); falha('valor sem aprovacao', m);
m = proposta(); m.decisions[1].valor = 50; falha('tecto preenchido sem aprovacao', m);
m = proposta(); m.notas = 'enviar para 0x' + 'ab'.repeat(20); falha('endereco sem aprovacao', m);
m = proposta(); m.absolute_limits.automatic_trade_usdc = 5; falha('comercio alargado', m);
m = proposta(); m.absolute_limits.unlimited_approval = true; falha('aprovacao ilimitada', m);
m = proposta(); delete m.decisions[2].recomendacao; falha('decisao sem recomendacao', m);
m = proposta(); m.decisions = []; falha('sem decisoes', m);
m = proposta(); m.custody.organism_cannot = m.custody.organism_cannot.filter((c) => !/alargar o envelope/i.test(c)); falha('ORA pode alargar o envelope', m);
m = proposta(); m.custody.organism_cannot = m.custody.organism_cannot.filter((c) => !/assinar a activa/i.test(c)); falha('ORA pode assinar', m);
m = proposta(); m.truth_boundary = 'tudo certo'; falha('sem fronteira de verdade', m);
falha('lida por superficie', proposta(), ['api/tesouraria.js']);
m = proposta(); m.format = 'outro'; falha('format', m);
// com aprovacao parcial registada (D2 a D8), o estado muda mas D1 e os enderecos continuam proibidos
const aprov = (extra = {}) => ({ data: '2026-10-17', citacao: 'tudo como recomendas', decisoes_aprovadas: ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'], decisoes_pendentes: ['D1'], ...extra });
m = proposta(); m.aprovacao_unum = aprov(); m.status = 'aprovada_aguarda_destinos_e_assinatura'; m.decisions[1].valor = 5;
assert.deepEqual(validar(m), [], 'aprovacao parcial com D2 devia passar');
m = proposta(); m.aprovacao_unum = aprov(); m.status = 'aprovada_aguarda_destinos_e_assinatura'; m.decisions[0].valor = '0x' + '1'.repeat(40); falha('D1 preenchida sem aprovacao a D1', m);
m = proposta(); m.aprovacao_unum = aprov(); m.status = 'aprovada_aguarda_destinos_e_assinatura'; m.notas = '0x' + 'cd'.repeat(20); falha('endereco solto com D1 pendente', m);
m = proposta(); m.aprovacao_unum = aprov(); m.status = 'activa'; falha('activa mesmo com aprovacao', m);
m = proposta(); m.aprovacao_unum = aprov({ citacao: '' }); m.status = 'aprovada_aguarda_destinos_e_assinatura'; falha('aprovacao sem citacao', m);
m = proposta(); m.status = 'aprovada_aguarda_destinos_e_assinatura'; falha('estado aprovado sem aprovacao registada', m);
m = proposta(); m.aprovacao_unum = aprov(); m.status = 'aprovada_aguarda_destinos_e_assinatura'; m.absolute_limits.automatic_debt_usdc = 1; falha('divida alargada apesar de D4 manter 0', m);

// mentiras sobre os destinos da D1 no estado real
const troca = (a) => a.slice(0, -1) + (a.endsWith('a') ? 'b' : 'a');
m = clone(); m.decisions[0].valor.sustento_unum[0].address = troca(m.decisions[0].valor.sustento_unum[0].address); falha('Base sagrada com uma letra trocada', m);
m = clone(); m.decisions[0].valor.sustento_unum[1].address = troca(m.decisions[0].valor.sustento_unum[1].address); falha('BTC de sustento com uma letra trocada', m);
m = clone(); m.decisions[0].valor.continuidade_orum[0].address = troca(m.decisions[0].valor.continuidade_orum[0].address); falha('Base operacional com uma letra trocada', m);
m = clone(); m.decisions[0].valor.continuidade_orum[1].address = troca(m.decisions[0].valor.continuidade_orum[1].address); falha('BTC operacional com uma letra trocada', m);
m = clone(); m.decisions[0].valor.sustento_unum[0].address = m.decisions[0].valor.continuidade_orum[0].address; falha('sustento aponta para a carteira operacional', m);
m = clone(); m.decisions[0].valor.sustento_unum.push({ rail: 'ethereum', asset: 'ETH', address: '0x' + '9'.repeat(40) }); falha('destino extra nao registado', m);
m = clone(); m.decisions[0].valor.sustento_unum = [m.decisions[0].valor.sustento_unum[0]]; falha('falta o BTC de sustento', m);
falha('D1 sem registos para cruzar', clone(), [], null);

// mentiras sobre o estado aprovado real
m = clone(); m.decisions[0].valor = '0x' + '2'.repeat(40); falha('D1 preenchida no estado real sem Unum a ter aprovado', m);
m = clone(); m.aprovacao_unum.decisoes_aprovadas = m.aprovacao_unum.decisoes_aprovadas.filter((x) => x !== 'D2'); falha('valor D2 sem estar na lista aprovada', m);
m = clone(); m.status = 'activa'; falha('estado real marcado activo', m);
m = clone(); m.absolute_limits.automatic_bridge_usdc = 1; falha('ponte alargada no estado real', m);
m = clone(); m.aprovacao_unum = null; falha('estado aprovado apagou a aprovacao', m);
if (real.aprovacao_unum) assert.ok(real.aprovacao_unum.decisoes_pendentes.includes('D1') === (real.decisions[0].valor === null), 'D1 so sai de pendente quando tiver valor');

console.log(JSON.stringify({ verified: true, estado: real.status, aprovadas: real.aprovacao_unum?.decisoes_aprovadas ?? [], pendentes: real.aprovacao_unum?.decisoes_pendentes ?? [], decisoes: real.decisions.length, casos_de_mentira: mentiras }));
