// Verifica a ferramenta probe_anchor_layers do conector @weave_hands (livro 1238): o leitor de recibos é o mesmo do repositório (comparado em todos os
// recibos reais), a classificação das respostas dos calendários, a lista de calendários admitidos (o recibo vem de fora, nunca escolhe a quem se pergunta)
// e as fronteiras (só GET, sem segredos, sem escrita, sem juntar provas, sem afirmar âncora).
// Cada regra tem um estrago propositado: a mesma verificação, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lerRecibo as lerRepo } from './lib/ots.mjs';

const DIR = 'supabase/functions/weave-hands';
const lerTexto = (p) => fs.readFileSync(p, 'utf8');
const recibos = fs.readdirSync('ancora').filter((f) => /^raiz-registos(-\d+)?\.ots$/.test(f) || f === 'oro-v1.ots').sort();
assert.ok(recibos.length >= 17, 'recibos reais em falta');

async function carregar(ancora) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ancora-')), 'ancora.mjs');
  fs.writeFileSync(f, ancora);
  return import(pathToFileURL(f).href + '?' + Math.random());
}

async function verificar({ ancora, leitura, hands, discovery, card }) {
  const m = await carregar(ancora);
  // o leitor é o do repositório, em todos os recibos reais
  for (const f of recibos) {
    const b = fs.readFileSync(path.join('ancora', f));
    assert.deepEqual(m.lerRecibo(b), lerRepo(b), `o leitor diverge do do repositório em ${f}`);
  }
  assert.throws(() => m.lerRecibo(Buffer.from('nao e um recibo')), 'recibo inválido deve ser recusado');
  const trunc = fs.readFileSync('ancora/raiz-registos-16.ots').subarray(0, 100);
  assert.throws(() => m.lerRecibo(trunc), 'recibo truncado deve ser recusado');
  assert.throws(() => m.lerRecibo(Buffer.concat([fs.readFileSync('ancora/raiz-registos-16.ots'), Buffer.from([0])])), 'bytes a mais devem ser recusados');
  // calendários: só os três, sem barra final, nada escrito no recibo
  assert.deepEqual(m.CALENDARIOS, ['https://alice.btc.calendar.opentimestamps.org', 'https://bob.btc.calendar.opentimestamps.org', 'https://finney.calendar.eternitywall.com']);
  assert.equal(m.calendarioAdmitido('https://alice.btc.calendar.opentimestamps.org'), true);
  assert.equal(m.calendarioAdmitido('https://alice.btc.calendar.opentimestamps.org/'), true);
  assert.equal(m.calendarioAdmitido('https://evil.example'), false, 'calendário de fora admitido');
  assert.equal(m.calendarioAdmitido('http://alice.btc.calendar.opentimestamps.org'), false, 'calendário sem https admitido');
  assert.equal(m.calendarioAdmitido('https://alice.btc.calendar.opentimestamps.org.evil.example'), false, 'prefixo admitido');
  assert.equal(m.compromissoValido('6ae6f87d'), true);
  for (const mau of ['', '../x', '6ae6f87d/../../x', '6ae6f87d/../..', '..', 'ZZ', '6ae6f87', 'a'.repeat(130)]) assert.equal(m.compromissoValido(mau), false, `compromisso inválido aceite: ${mau}`);
  // classificação
  assert.equal(m.classificarResposta(200, '').estado, 'prova_disponivel');
  const tx = 'e289cd0dcf1d4d68e1c4c2d9c6d07e60f29671e5540e18fc5712be59b4fc48bd';
  const c = m.classificarResposta(404, `Timestamped by transaction ${tx}; waiting for 6 confirmations`);
  assert.deepEqual(c, { estado: 'tx_sem_bloco', txid: tx, confirmacoes_pedidas: 6 });
  assert.equal(m.classificarResposta(404, 'Pending confirmation in Bitcoin blockchain').estado, 'pendente');
  assert.equal(m.classificarResposta(500, 'Pending confirmation in Bitcoin blockchain').estado, 'resposta_inesperada', 'um 5xx não é pendente');
  assert.equal(m.classificarResposta(404, 'outra coisa').estado, 'resposta_inesperada');
  assert.equal(m.classificarResposta(404, 'Timestamped by transaction XYZ; waiting for 6 confirmations').estado, 'resposta_inesperada', 'txid inválido aceite');
  // confirmações
  assert.equal(m.confirmacoes({ confirmed: true, block_height: 100 }, 100), 1);
  assert.equal(m.confirmacoes({ confirmed: true, block_height: 100 }, 105), 6);
  assert.equal(m.confirmacoes({ confirmed: false }, 105), null);
  assert.equal(m.confirmacoes({ confirmed: true, block_height: 100 }, 99), null, 'topo abaixo do bloco');
  assert.equal(m.confirmacoes(null, 105), null);
  // estado da camada
  assert.equal(m.estadoDaCamada([{ estado: 'pendente' }, { estado: 'bitcoin' }]), 'bitcoin_no_recibo');
  assert.equal(m.estadoDaCamada([{ estado: 'pendente' }, { estado: 'prova_disponivel' }]), 'prova_por_juntar');
  assert.equal(m.estadoDaCamada([{ estado: 'pendente' }, { estado: 'tx_sem_bloco' }]), 'tx_sem_bloco');
  assert.equal(m.estadoDaCamada([{ estado: 'pendente' }]), 'pendente');
  assert.equal(m.estadoDaCamada([{ estado: 'leitura_falhou' }]), 'sem_leitura');
  assert.equal(m.estadoDaCamada([]), 'sem_leitura');
  assert.equal(m.FONTES_RECIBO(17).length, 2, 'o recibo tem de ter duas moradas');
  assert.match(m.FONTES_RECIBO(17)[0], /raw\.githubusercontent\.com\/fomosdeimos-gif\/orum-ora-x402\/main\/ancora\/raiz-registos-17\.ots$/);
  assert.equal(Object.keys(m.ESPLORA).length, 2, 'duas fontes Esplora');
  assert.ok(m.MAX_CAMADAS >= 1 && m.MAX_CAMADAS <= 8);
  // fronteiras no código implantável
  for (const proibido of [/Deno\.env/, /SERVICE_ROLE|SECRET|API_KEY|[A-Z]_TOKEN/, /createClient/, /sign(Message|Typed|Transaction)/i, /method:\s*["'](POST|PUT|DELETE|PATCH)["']/, /\.insert\(|\.upsert\(|\.delete\(/, /\/rest\/v1\//, /writeFile|appendFile/, /\/digest/]) {
    assert.doesNotMatch(leitura, proibido, `fronteira violada: ${proibido}`);
  }
  assert.match(leitura, /readOnlyHint: true/);
  assert.match(leitura, /name: "probe_anchor_layers"/);
  assert.match(leitura, /claims_anchor: false/);
  assert.match(leitura, /joins_proofs: false/);
  assert.match(leitura, /pays_or_signs: false/);
  assert.match(leitura, /stores_nothing: true/);
  assert.match(leitura, /!calendarioAdmitido\(a\.calendario\) \|\| !compromissoValido\(a\.compromisso \?\? ""\)/, 'a leitura deixou de recusar calendários e compromissos não admitidos');
  assert.match(leitura, /que uma camada esteja ancorada: só um bloco conferido/);
  assert.match(leitura, /import \{[^}]*lerRecibo[^}]*\} from "\.\/ancora\.mjs"/, 'o leitor de recibos deixou de ser o da cópia verificada');
  assert.doesNotMatch(leitura, /prometemos|garant(e|imos) (receita|valor|retorno)/i);
  // ligação ao conector e descoberta
  assert.match(hands, /import \{ ANCORA_TOOLS, callAncora \} from "\.\/ancora-leitura\.ts"/, 'weave-hands não importa a ferramenta');
  assert.match(hands, /\.\.\.ANCORA_TOOLS/, 'weave-hands não expõe a ferramenta');
  assert.match(hands, /const ancora = callAncora\(name, args\);\n  if \(ancora\) return await ancora;/, 'weave-hands não chama callAncora');
  assert.doesNotMatch(hands, /Deno\.env|SERVICE_ROLE/, 'weave-hands usa segredos');
  const d = JSON.parse(discovery);
  assert.ok(d.mcp.tools.includes('probe_anchor_layers'), 'descoberta sem a ferramenta');
  assert.equal(d.ancora.tool, 'probe_anchor_layers');
  for (const k of ['joins_proofs', 'claims_anchor', 'stores_anything', 'uses_credentials', 'pays_or_signs']) assert.equal(d.ancora[k], false, `descoberta: ancora.${k} deve ser false`);
  assert.equal(d.ancora.get_only, true);
  const cc = JSON.parse(card).serviceInterfaces.find((x) => x.name === '@weave_hands');
  assert.deepEqual(cc.tools, d.mcp.tools, 'agent-card e descoberta com listas diferentes');
}

const real = {
  ancora: lerTexto(`${DIR}/ancora.mjs`),
  leitura: lerTexto(`${DIR}/ancora-leitura.ts`),
  hands: lerTexto(`${DIR}/index.ts`),
  discovery: lerTexto('discovery/weave-hands.json'),
  card: lerTexto('.well-known/agent-card.json'),
};
await verificar(real);

const estragos = [
  ['leitor lê o selo Bitcoin com a tag trocada', { ancora: real.ancora.replace("'0588960d73d71901'", "'0588960d73d71902'") }],
  ['leitor perde a recusa de bytes a mais', { ancora: real.ancora.replace("if (!r.done()) throw new Error('bytes a mais depois do recibo');", '') }],
  ['leitor perde a recusa de cabeçalho inválido', { ancora: real.ancora.replace("if (!r.bytes(MAGIC.length).equals(MAGIC)) throw new Error('cabeçalho OpenTimestamps inválido');", '') }],
  ['leitor lê varuint errado', { ancora: real.ancora.replace('(b & 0x7f) * 2 ** shift', '(b & 0x7f) * 2 ** (shift + 1)') }],
  ['calendário de fora admitido', { ancora: real.ancora.replace("'https://finney.calendar.eternitywall.com']", "'https://finney.calendar.eternitywall.com', 'https://evil.example']") }],
  ['calendário admitido por prefixo', { ancora: real.ancora.replace("CALENDARIOS.includes(String(url).replace(/\\/+$/, ''))", "CALENDARIOS.some((c) => String(url).startsWith(c))") }],
  ['compromisso com barras aceite', { ancora: real.ancora.replace('/^[0-9a-f]{2,128}$/', '/^[0-9a-f\\/.]{2,128}$/') }],
  ['um 5xx tomado por pendente', { ancora: real.ancora.replace("if (status === 404 && /Pending", "if (/Pending") }],
  ['txid sem validar', { ancora: real.ancora.replace('([0-9a-f]{64})', '(\\S+)') }],
  ['404 tomado por prova', { ancora: real.ancora.replace('if (status === 200) return', 'if (status === 200 || status === 404) return') }],
  ['confirmações com topo abaixo do bloco', { ancora: real.ancora.replace('|| topo < status.block_height', '') }],
  ['confirmações contam o bloco a menos', { ancora: real.ancora.replace('topo - status.block_height + 1', 'topo - status.block_height') }],
  ['prova por juntar tomada por tx', { ancora: real.ancora.replace("if (ramos.some((r) => r.estado === 'prova_disponivel')) return 'prova_por_juntar';", '') }],
  ['só uma morada do recibo', { ancora: real.ancora.replace(", `https://ora-x402-gateway.vercel.app/ancora/raiz-registos-${n}.ots`]", ']') }],
  ['só uma fonte Esplora', { ancora: real.ancora.replace(", blockstream: 'https://blockstream.info/api'", '') }],
  ['usa segredo do ambiente', { leitura: real.leitura + '\nconst k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");' }],
  ['escreve na base', { leitura: real.leitura + '\nawait fetch(`${BASE}/rest/v1/x`, { method: "POST" });' }],
  ['envia ao calendário', { leitura: real.leitura.replace('/timestamp/${a.compromisso}`', '/digest`') }],
  ['deixa de ser só leitura', { leitura: real.leitura.replace('readOnlyHint: true', 'readOnlyHint: false') }],
  ['afirma âncora', { leitura: real.leitura.replace('claims_anchor: false', 'claims_anchor: true') }],
  ['junta provas', { leitura: real.leitura.replace('joins_proofs: false', 'joins_proofs: true') }],
  ['pergunta a calendário escrito no recibo', { leitura: real.leitura.replace('!calendarioAdmitido(a.calendario) || ', '') }],
  ['perde o limite de não afirmar âncora', { leitura: real.leitura.replace('que uma camada esteja ancorada: só um bloco conferido', 'nada') }],
  ['descoberta diz que junta provas', { discovery: real.discovery.replace('"joins_proofs": false', '"joins_proofs": true') }],
  ['descoberta diz que afirma âncora', { discovery: real.discovery.replace('"claims_anchor": false', '"claims_anchor": true') }],
  ['descoberta sem a ferramenta', { discovery: real.discovery.replaceAll('"probe_anchor_layers",\n      "probe_payment_route"', '"probe_payment_route"') }],
  ['agent-card sem a ferramenta', { card: real.card.replace('"probe_anchor_layers",\n        ', '') }],
  ['weave-hands deixa de expor a ferramenta', { hands: real.hands.replace('...ANCORA_TOOLS,', '') }],
  ['weave-hands deixa de chamar callAncora', { hands: real.hands.replace('if (ancora) return await ancora;', '') }],
  ['weave-hands passa a usar segredos', { hands: real.hands + '\nconst k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");' }],
];
let apanhados = 0;
for (const [nome, troca] of estragos) {
  const estragado = { ...real, ...troca };
  assert.notEqual(JSON.stringify(estragado), JSON.stringify(real), `o estrago "${nome}" não alterou nada (padrão desactualizado)`);
  let caiu = false;
  try { await verificar(estragado); } catch { caiu = true; }
  assert.ok(caiu, `estrago NÃO apanhado: ${nome}`);
  apanhados++;
}
console.log(`weave-hands-ancora: ferramenta conferida; ${apanhados} estragos propositados apanhados.`);
