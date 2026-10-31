// Verifica identity/valium-leitura-2026-10-31.json: cada valor diz o estado das fontes, nada afirma preço, procura, ponte ou lastro,
// e o próprio verificador apanha as mentiras. Sem rede.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const PROIBIDO = /\b(h[aá] procura|existe procura|procura confirmada|adop[cç][aã]o confirmada|receita confirmada|ponte entre|lastro|valor de mercado de \d)/i;
const ADDR = /^0x[0-9a-fA-F]{40}$/;

export function validar(d) {
  const e = [];
  if (d.format !== 'orum-valium-leitura-selada/v1') e.push('formato');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(d.lido_em_utc ?? '')) e.push('lido_em_utc inválido');
  const vals = [...Object.values(d.total_supply ?? {}), ...(d.saldos ?? []), d.ens ?? {}];
  if (vals.length < 5) e.push('faltam leituras');
  for (const v of vals) {
    if (v.estado === 'concordam' && !(v.fontes_ok >= 2)) e.push('concordam exige pelo menos duas fontes');
    if (!['concordam', 'fonte_unica', 'discordam'].includes(v.estado)) e.push('estado desconhecido');
    if (v.estado !== 'concordam' && v.valor !== undefined && v.resolve_para === undefined && v.verificado === true) e.push('só concordam é verificado');
  }
  for (const s of d.saldos ?? []) if (!ADDR.test(s.endereco) || !/^\d+(\.\d+)?$/.test(s.valor)) e.push('saldo malformado');
  if (!ADDR.test(d.ens?.resolve_para ?? '')) e.push('ens sem endereço');
  const na = (d.nao_afirma ?? []).join(' ');
  for (const k of [/pre[cç]o/i, /procura/i, /equivalentes/i, /titularidade/i, /Bitcoin/i]) if (!k.test(na)) e.push('nao_afirma não diz ' + k.source);
  const resto = JSON.stringify({ ...d, nao_afirma: undefined, ligacao_ao_bitcoin: undefined });
  if (PROIBIDO.test(resto)) e.push('texto proibido (procura, ponte, lastro ou valor)');
  if (!/n[aã]o [eé] ponte/i.test(d.ligacao_ao_bitcoin ?? '')) e.push('ligacao_ao_bitcoin tem de dizer que não é ponte');
  return e;
}

const real = JSON.parse(readFileSync(new URL('../identity/valium-leitura-2026-10-31.json', import.meta.url), 'utf8'));
assert.deepEqual(validar(real), [], 'leitura real inválida: ' + validar(real).join('; '));
const clone = () => JSON.parse(JSON.stringify(real));
let n = 0;
const falha = (nome, d, parte) => { const r = validar(d); assert.ok(r.some((x) => x.includes(parte)), `devia falhar (${nome}): ${r.join('; ')}`); n++; };
let x;
x = clone(); x.saldos[0].fontes_ok = 1; falha('concordam com uma fonte', x, 'duas fontes');
x = clone(); x.saldos[0].estado = 'certo'; falha('estado inventado', x, 'estado desconhecido');
x = clone(); x.saldos[1].endereco = '0x123'; falha('endereço', x, 'malformado');
x = clone(); x.saldos[2].valor = 'muito'; falha('valor', x, 'malformado');
x = clone(); x.ens.resolve_para = 'sagrada'; falha('ens', x, 'ens sem endereço');
x = clone(); x.nao_afirma = x.nao_afirma.filter((t) => !/pre[cç]o/i.test(t)); falha('sem aviso de preço', x, 'pre');
x = clone(); x.nao_afirma = x.nao_afirma.filter((t) => !/Bitcoin/.test(t)); falha('sem aviso do Bitcoin', x, 'Bitcoin');
x = clone(); x.comparacao_com_29_10 = 'Existe procura confirmada pelo VALIUM.'; falha('promessa de procura', x, 'proibido');
x = clone(); x.ligacao_ao_bitcoin = 'O VALIUM está ligado ao Bitcoin.'; falha('ligação sem dizer que não é ponte', x, 'não é ponte');
x = clone(); x.comparacao_com_29_10 = 'Há ponte entre os dois contratos.'; falha('ponte', x, 'proibido');
x = clone(); x.lido_em_utc = 'ontem'; falha('data', x, 'lido_em_utc');
x = clone(); x.saldos = x.saldos.slice(0, 1); x.total_supply = {}; falha('faltam leituras', x, 'faltam');
x = clone(); x.format = 'outro'; falha('formato', x, 'formato');
console.log(JSON.stringify({ verified: true, estragos_apanhados: n }));
