// Verifica a ferramenta probe_payment_route do @weave_hands (livro 1204): a lógica no servidor é a mesma de
// scripts/sonda-pagamento.mjs (funções iguais, contrato igual às fontes únicas), só faz GET, não usa segredos,
// e cada regra tem um estrago propositado que tem de ser apanhado.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as script from './sonda-pagamento.mjs';

const require = createRequire(import.meta.url);
const carteira = require('../api/_carteira.js');
const facilitador = require('../api/_facilitador.js');
const DIR = 'supabase/functions/weave-hands';
const ler = (p) => fs.readFileSync(p, 'utf8');

async function carregar(texto) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sonda-')), 'sonda.mjs');
  fs.writeFileSync(f, texto);
  return import(pathToFileURL(f).href + '?' + Math.random());
}

const resp = (status, corpo, cab) => ({ status, texto: typeof corpo === 'string' ? corpo : JSON.stringify(corpo), headers: { get: (n) => (n === 'payment-required' ? cab ?? null : null) } });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

async function verificar({ sondaTxt, index }) {
  const m = await carregar(sondaTxt);
  // mesma fonte, duas moradas: as funções são iguais às do script e o contrato às fontes únicas
  for (const f of ['sondar', 'sondarRota', 'sondarFacilitador']) assert.equal(m[f].toString(), script[f].toString(), `${f} diverge de scripts/sonda-pagamento.mjs`);
  assert.deepEqual(m.CONTRATO, script.CONTRATO, 'contrato diverge do script');
  assert.deepEqual(m.ROTAS, script.ROTAS, 'rotas divergem do script');
  assert.deepEqual(m.FACILITADORES, script.FACILITADORES, 'facilitadores divergem do script');
  assert.equal(m.BASE, script.BASE);
  assert.equal(m.CONTRATO.payTo, carteira.RECEBIMENTO, 'payTo diverge de api/_carteira.js');
  assert.equal(m.CONTRATO.network, facilitador.REDE, 'rede diverge de api/_facilitador.js');
  assert.deepEqual(m.FACILITADORES, facilitador.URLS_PADRAO, 'facilitadores divergem de api/_facilitador.js');
  // comportamento com rede simulada
  const desafio = (mut = {}) => ({ x402Version: 2, accepts: [{ scheme: 'exact', network: m.CONTRATO.network, amount: '161000', asset: m.CONTRATO.asset, payTo: m.CONTRATO.payTo, ...mut }] });
  const suportado = { kinds: [{ x402Version: 2, scheme: 'exact', network: m.CONTRATO.network }] };
  const fet = ({ rota, fac } = {}) => async (url) => (url.startsWith(m.BASE) ? (rota ? rota(url) : resp(402, desafio(), b64(desafio()))) : (fac ? fac(url) : resp(200, suportado)));
  const bom = await m.sondar({ fetcher: fet() });
  assert.equal(bom.ok, true); assert.equal(bom.algum_facilitador_pronto, true);
  const mau = async (nome, rota) => assert.equal((await m.sondarRota('/oraculo', { fetcher: fet({ rota }) })).ok, false, `não apanhado: ${nome}`);
  await mau('200 em vez de 402', () => resp(200, { ok: true }));
  await mau('payTo trocado', () => resp(402, desafio({ payTo: carteira.SAGRADA_NOVA }), b64(desafio({ payTo: carteira.SAGRADA_NOVA }))));
  await mau('esquema upto', () => resp(402, desafio({ scheme: 'upto' }), b64(desafio({ scheme: 'upto' }))));
  await mau('montante zero', () => resp(402, desafio({ amount: '0' }), b64(desafio({ amount: '0' }))));
  const semFac = await m.sondar({ fetcher: fet({ fac: () => resp(200, { kinds: [] }) }) });
  assert.equal(semFac.algum_facilitador_pronto, false, 'facilitador sem Base exact v2 contado como pronto');
  // só GET e sem pagamento
  assert.doesNotMatch(sondaTxt, /method:\s*['"](POST|PUT|DELETE|PATCH)/i, 'a sonda não pode escrever');
  assert.doesNotMatch(sondaTxt, /x-payment|payment-signature/i, 'a sonda não pode enviar prova de pagamento');
  assert.doesNotMatch(sondaTxt, /Deno\.env|SERVICE_ROLE|SECRET|API_KEY/i, 'a sonda não usa segredos');
  // ligação ao conector
  assert.match(index, /import \{ sondar, fetcherReal \} from "\.\/sonda\.mjs";/, 'weave-hands não importa a sonda');
  assert.match(index, /name: "probe_payment_route"/);
  assert.match(index, /if \(name === "probe_payment_route"\)/);
  assert.match(index, /await sondar\(\{ fetcher: fetcherReal \}\)/);
  assert.match(index, /pays_or_signs: false/);
  assert.match(index, /get_only: true/);
  assert.doesNotMatch(index, /Deno\.env|SERVICE_ROLE/, 'weave-hands usa segredos');
  assert.match(index, /que um pagamento completo/);
}

const real = { sondaTxt: ler(`${DIR}/sonda.mjs`), index: ler(`${DIR}/index.ts`) };
await verificar(real);

const estragos = [
  ['payTo trocado na cópia', { sondaTxt: real.sondaTxt.replace(carteira.RECEBIMENTO, carteira.SAGRADA_NOVA) }],
  ['rede trocada na cópia', { sondaTxt: real.sondaTxt.replace("'eip155:8453'", "'eip155:1'") }],
  ['a sonda aceita qualquer payTo', { sondaTxt: real.sondaTxt.replace("if (!CONTRATO.payToAceites.some((a) => igual(aceita.payTo, a)))", 'if (false)') }],
  ['a sonda aceita 200 como desafio', { sondaTxt: real.sondaTxt.replace("if (res.status !== 402)", 'if (false)') }],
  ['a sonda passa a enviar pagamento', { sondaTxt: real.sondaTxt + "\nawait fetch(BASE, { method: 'POST', headers: { 'x-payment': 'x' } });" }],
  ['a sonda usa segredo', { sondaTxt: real.sondaTxt + '\nconst k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");' }],
  ['facilitador contado sem anunciar', { sondaTxt: real.sondaTxt.replace("r.anuncia_base_exact_v2 = Array.isArray(kinds)", "r.anuncia_base_exact_v2 = true || Array.isArray(kinds)") }],
  ['weave-hands deixa de importar a sonda', { index: real.index.replace('import { sondar, fetcherReal } from "./sonda.mjs";', '') }],
  ['weave-hands deixa de expor a ferramenta', { index: real.index.replace('name: "probe_payment_route"', 'name: "outra"') }],
  ['weave-hands passa a usar segredos', { index: real.index + '\nconst k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");' }],
  ['weave-hands diz que paga', { index: real.index.replace('pays_or_signs: false, contacts_anyone: false },\n    });', 'pays_or_signs: true, contacts_anyone: false },\n    });') }],
  ['weave-hands perde o limite de não afirmar', { index: real.index.replace('que um pagamento completo', 'nada') }],
];
let n = 0;
for (const [nome, troca] of estragos) {
  const est = { ...real, ...troca };
  assert.notEqual(JSON.stringify(est), JSON.stringify(real), `o estrago "${nome}" não alterou nada (padrão desactualizado)`);
  let caiu = false;
  try { await verificar(est); } catch { caiu = true; }
  assert.ok(caiu, `estrago NÃO apanhado: ${nome}`);
  n++;
}
console.log(`sonda-weave: ferramenta conferida; ${n} estragos propositados apanhados.`);
