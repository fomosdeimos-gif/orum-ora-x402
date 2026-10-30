// Verifica scripts/vigia-entradas.mjs sem rede: os RPC da Base e as fontes Esplora são simulados. Prova que o vigia
// lista o que ENTRA nas carteiras do organismo, classifica o pagador sem nunca lhe chamar sustento, receita ou
// "externo", e que diz a verdade sobre o que não conseguiu ler. Depois estraga o código de propósito (cópia em /tmp)
// e exige que a suite falhe em cada estrago.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const SCRIPT = join(AQUI, 'vigia-entradas.mjs');

const AGORA = Date.parse('2026-10-23T12:00:00Z');
const HEAD = 1000000;
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const SAGRADA = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const OPERACIONAL = '0x89460d9e0590559e63860197dfe2ac648A753584';
const NOVA = '0x2ef8cfB97EcCcf7C62f551639fe6dB79022d0d8C';
const TESTE = '0x2Cf1C0Bcd06A75A836F333001f47aaeB33Fe51f1';
const DESCONHECIDO = '0x1111111111111111111111111111111111111111';
const OUTRO = '0x2222222222222222222222222222222222222222';
const BTC_SAGRADA = 'bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf';
const BTC_OPER = 'bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7';
const pad = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const hex = (n) => '0x' + n.toString(16);

function log({ tx, bloco, de, para, valor, address = USDC, idx = 0 }) {
  return { address, topics: [TOPIC, pad(de), pad(para)], data: '0x' + BigInt(valor).toString(16).padStart(64, '0'), transactionHash: tx, blockNumber: hex(bloco), logIndex: hex(idx) };
}
function btcTx({ txid, vin, vout, confirmada = true, idadeS = 600 }) {
  return { txid, vin: vin.map((a) => ({ prevout: { scriptpubkey_address: a } })), vout: vout.map(([a, v]) => ({ scriptpubkey_address: a, value: v })),
    status: confirmada ? { confirmed: true, block_height: 972700, block_time: Math.floor(AGORA / 1000) - idadeS } : { confirmed: false } };
}
// mundo: { logs, rpcFalha:{host:true}, logsFalham, sujos, btc: { 'mempool.space': {addr: [...]|'falha'}, blockstream: {...} } }
function mundo({ logs = [], rpcFalha = {}, logsFalham = false, sujos = false, btc = {} } = {}) {
  const f = async (url, init) => {
    url = String(url);
    const resp = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
    const rpcHost = ['base-rpc.publicnode.com', 'mainnet.base.org', 'base.gateway.tenderly.co'].find((h) => url.includes(h));
    if (rpcHost) {
      if (rpcFalha[rpcHost] === true) return resp(403, null);
      const { method, params } = JSON.parse(init.body);
      if (method === 'eth_blockNumber') return resp(200, { result: hex(HEAD) });
      if (method === 'eth_getBlockByNumber') return resp(200, { result: { timestamp: hex(Math.floor(AGORA / 1000) - (HEAD - parseInt(params[0], 16)) * 2) } });
      if (method === 'eth_getLogs') {
        if (logsFalham) return resp(200, { error: { message: 'invalid params' } });
        const [{ fromBlock, toBlock, topics }] = params;
        const de = parseInt(fromBlock, 16), ate = parseInt(toBlock, 16);
        const alvos = topics[2].map((x) => x.toLowerCase());
        return resp(200, { result: logs.filter((l) => parseInt(l.blockNumber, 16) >= de && parseInt(l.blockNumber, 16) <= ate && (sujos || alvos.includes(l.topics[2].toLowerCase()))) });
      }
      throw new Error('metodo inesperado ' + method);
    }
    const m = /^https:\/\/(mempool\.space|blockstream\.info)\/api\/address\/([a-z0-9]+)\/txs$/.exec(url);
    if (m) {
      const fonte = m[1] === 'mempool.space' ? 'mempool.space' : 'blockstream';
      const v = (btc[fonte] || {})[m[2]];
      if (v === 'falha') return resp(500, null);
      return resp(200, v || []);
    }
    throw new Error('sem rota ' + url);
  };
  return f;
}

async function suite(vigiar) {
  const correr = (w, extra = {}) => vigiar({ horas: 5, fetchFn: w, agora: AGORA, ...extra });
  const blocoRecente = HEAD - 500;

  // 1. Entradas na Base: teste interno, desconhecido na operacional, 70% interno para a sagrada nova.
  let w = mundo({ logs: [
    log({ tx: '0xaaa1', bloco: blocoRecente, de: TESTE, para: SAGRADA, valor: 161000 }),
    log({ tx: '0xbbb2', bloco: blocoRecente + 10, de: DESCONHECIDO, para: OPERACIONAL, valor: 330000 }),
    log({ tx: '0xccc3', bloco: blocoRecente + 20, de: OPERACIONAL, para: NOVA, valor: 70000 }),
  ] });
  let r = await correr(w);
  const por = (tx) => r.entradas.find((e) => e.tx === tx);
  assert.equal(por('0xaaa1').classe, 'interno', 'a carteira de teste da ORA e interna');
  assert.equal(por('0xbbb2').classe, 'por_classificar', 'pagador desconhecido fica por classificar');
  assert.equal(por('0xbbb2').valor_usdc, 0.33);
  assert.equal(por('0xccc3').classe, 'interno', 'o envio dos 70% e interno');
  assert.deepEqual(r.por_classificar.map((e) => e.tx), ['0xbbb2']);
  assert.equal(r.internas, 2);
  assert.equal(r.leitura_completa.base, true);
  assert.equal(r.ausencia_provada_na_janela, false);
  assert.equal(por('0xaaa1').hora_estimada, false, 'hora lida do bloco');
  assert.match(por('0xaaa1').hora_utc, /^2026-10-23T/);

  // 2. Nunca se chama sustento, receita ou externo.
  for (const e of r.entradas) assert.ok(['interno', 'por_classificar'].includes(e.classe), 'classe ' + e.classe);
  assert.doesNotMatch(JSON.stringify(r.entradas), /sustento|receita|externo/i);
  assert.match(r.nota, /não é sustento nem receita/);

  // 3. Defesas: outro token, destino que nao e nosso, duplicado e saida nossa.
  w = mundo({ sujos: true, logs: [
    log({ tx: '0xddd4', bloco: blocoRecente, de: DESCONHECIDO, para: SAGRADA, valor: 5, address: '0x9999999999999999999999999999999999999999' }),
    log({ tx: '0xeee5', bloco: blocoRecente, de: SAGRADA, para: OUTRO, valor: 1000000 }),
    log({ tx: '0xfff6', bloco: blocoRecente, de: DESCONHECIDO, para: SAGRADA, valor: 7 }),
    log({ tx: '0xfff6', bloco: blocoRecente, de: DESCONHECIDO, para: SAGRADA, valor: 7 }),
  ] });
  r = await correr(w);
  assert.deepEqual(r.entradas.map((e) => e.tx), ['0xfff6'], 'so o USDC verdadeiro, so para nos, sem duplicados');

  // 4. A janela conta: um log antigo fica de fora.
  w = mundo({ logs: [log({ tx: '0x0ld1', bloco: HEAD - 30000, de: DESCONHECIDO, para: SAGRADA, valor: 9 })] });
  r = await correr(w);
  assert.equal(r.entradas.length, 0);
  assert.equal(r.ausencia_provada_na_janela, true, 'janela completa e vazia');

  // 5. RPC: o primeiro falha, o segundo serve.
  w = mundo({ rpcFalha: { 'base-rpc.publicnode.com': true }, logs: [log({ tx: '0xaaa7', bloco: blocoRecente, de: DESCONHECIDO, para: SAGRADA, valor: 3 })] });
  r = await correr(w);
  assert.equal(r.entradas.length, 1);
  assert.equal(r.leitura_completa.base, true);

  // 6. Leitura incompleta nunca vira "zero": diz-o e nao prova ausencia.
  w = mundo({ logsFalham: true });
  r = await correr(w);
  assert.equal(r.entradas.length, 0);
  assert.equal(r.leitura_completa.base, false);
  assert.ok(r.lacunas.length > 0 && r.lacunas.every((l) => /sem leitura/.test(l)));
  assert.equal(r.ausencia_provada_na_janela, false);
  w = mundo({ rpcFalha: { 'base-rpc.publicnode.com': true, 'mainnet.base.org': true, 'base.gateway.tenderly.co': true } });
  r = await correr(w);
  assert.equal(r.leitura_completa.base, false);
  assert.match(r.lacunas[0], /nenhum RPC respondeu/);
  assert.equal(r.ausencia_provada_na_janela, false);

  // 7. Bitcoin: desconhecido na operacional, interna da sagrada para a operacional, saida nossa, janela, mempool.
  const t1 = btcTx({ txid: 'b'.repeat(64), vin: ['bc1qdesconhecido'], vout: [[BTC_OPER, 400], ['bc1qtroco', 100]] });
  const t2 = btcTx({ txid: 'c'.repeat(64), vin: [BTC_SAGRADA], vout: [[BTC_OPER, 900]] });
  const t3 = btcTx({ txid: 'd'.repeat(64), vin: [BTC_OPER], vout: [['bc1qoutro', 700]] });
  const t4 = btcTx({ txid: 'e'.repeat(64), vin: ['bc1qdesconhecido'], vout: [[BTC_SAGRADA, 50]], idadeS: 3600 * 24 * 30 });
  const t5 = btcTx({ txid: 'f'.repeat(64), vin: ['bc1qdesconhecido'], vout: [[BTC_SAGRADA, 80]], confirmada: false });
  const t6 = btcTx({ txid: '9'.repeat(64), vin: [BTC_SAGRADA, 'bc1qdesconhecido'], vout: [[BTC_OPER, 60]] });
  w = mundo({ btc: { 'mempool.space': { [BTC_OPER]: [t1, t2, t3, t6], [BTC_SAGRADA]: [t4, t5] }, blockstream: { [BTC_OPER]: [t1, t2, t3, t6], [BTC_SAGRADA]: [t4, t5] } } });
  r = await correr(w);
  const bt = (ch) => r.entradas.find((e) => e.rede === 'bitcoin' && e.tx.startsWith(ch));
  assert.equal(bt('b').classe, 'por_classificar');
  assert.equal(bt('b').valor_sats, 400, 'conta so o que entra no nosso endereco, nao o troco');
  assert.deepEqual(bt('b').fontes.sort(), ['blockstream', 'mempool.space']);
  assert.equal(bt('c').classe, 'interno');
  assert.equal(bt('d'), undefined, 'uma saida nossa nao e entrada');
  assert.equal(bt('e'), undefined, 'confirmada ha 30 dias: fora da janela');
  assert.equal(bt('f').confirmada, false, 'a tx em mempool aparece, marcada nao confirmada');
  assert.equal(bt('9').classe, 'por_classificar', 'entradas mistas ficam por classificar');
  assert.equal(r.entradas.filter((e) => e.tx.startsWith('b')).length, 1, 'uma tx vista por duas fontes conta uma vez');
  assert.equal(r.leitura_completa.bitcoin, true);

  // 8. Uma fonte Bitcoin em falha: lista com a outra e diz que a leitura e incompleta.
  w = mundo({ btc: { 'mempool.space': { [BTC_OPER]: 'falha' }, blockstream: { [BTC_OPER]: [t1] } } });
  r = await correr(w);
  assert.equal(r.leitura_completa.bitcoin, false);
  assert.deepEqual(r.entradas.filter((e) => e.rede === 'bitcoin').map((e) => e.fontes), [['blockstream']]);
  assert.ok(r.lacunas.some((l) => /mempool\.space/.test(l)));

  // 9. O que ja foi visto nao volta a ser notificado.
  w = mundo({ logs: [log({ tx: '0xbbb2', bloco: blocoRecente, de: DESCONHECIDO, para: OPERACIONAL, valor: 330000 })] });
  r = await correr(w, { jaVistos: ['0xBBB2'] });
  assert.equal(r.entradas.length, 1, 'continua listada');
  assert.equal(r.por_classificar.length, 0, 'mas ja nao e nova');

  // 10. Cobertura: a janela só prova ausência desde a última leitura se tocar nela (livro 1181).
  const horasAntes = (h) => new Date(AGORA - h * 3600 * 1000).toISOString();
  w = mundo({});
  r = await correr(w, { ultimaLeitura: horasAntes(2) });
  assert.equal(r.cobertura.intervalo_nao_coberto, null, 'leitura há 2 h: a janela de 5 h toca nela');
  assert.equal(r.cobertura.continua_desde_ultima_leitura, true);
  assert.equal(r.ausencia_provada_desde_ultima_leitura, true);
  r = await correr(w, { ultimaLeitura: horasAntes(29) });
  assert.deepEqual(r.cobertura.intervalo_nao_coberto, { desde: horasAntes(29), ate: horasAntes(5), horas: 24 }, 'leitura há 29 h: faltam 24 h por ler');
  assert.equal(r.cobertura.continua_desde_ultima_leitura, false);
  assert.equal(r.ausencia_provada_desde_ultima_leitura, false, 'com intervalo por ler a ausência não está provada');
  assert.equal(r.ausencia_provada_na_janela, true, 'a janela em si continua provada');
  r = await correr(w);
  assert.equal(r.cobertura.ultima_leitura, null);
  assert.equal(r.cobertura.continua_desde_ultima_leitura, false, 'sem última leitura não se afirma continuidade');
  assert.equal(r.ausencia_provada_desde_ultima_leitura, false);
  assert.equal(r.proxima_ultima_leitura, new Date(AGORA).toISOString(), 'leitura completa: passa a ser a referência seguinte');
  w = mundo({ logs: [log({ tx: '0xbbb2', bloco: blocoRecente, de: DESCONHECIDO, para: OPERACIONAL, valor: 330000 })] });
  r = await correr(w, { ultimaLeitura: horasAntes(2) });
  assert.equal(r.ausencia_provada_desde_ultima_leitura, false, 'com entradas não há ausência');
  w = mundo({ logsFalham: true });
  r = await correr(w, { ultimaLeitura: horasAntes(2) });
  assert.equal(r.ausencia_provada_desde_ultima_leitura, false, 'leitura incompleta não prova ausência');
  assert.equal(r.proxima_ultima_leitura, horasAntes(2), 'leitura incompleta não avança a referência');
  r = await correr(w);
  assert.equal(r.proxima_ultima_leitura, null, 'incompleta e sem referência anterior: nada a passar');
  await assert.rejects(() => correr(mundo({}), { ultimaLeitura: 'ontem' }), /invalida/, 'data inválida recusa-se');
}

// ---- A suite tem de passar no codigo real ----
const real = await import(pathToFileURL(SCRIPT).href);
await suite(real.vigiar);

// ---- E falhar em cada estrago ----
let estragos = 0;
async function estraga(nome, de, para) {
  const tmp = mkdtempSync(join(tmpdir(), 'vigia-'));
  try {
    mkdirSync(join(tmp, 'scripts')); mkdirSync(join(tmp, 'economia'));
    cpSync(join(RAIZ, 'economia', 'enderecos-internos.json'), join(tmp, 'economia', 'enderecos-internos.json'));
    const src = readFileSync(SCRIPT, 'utf8');
    assert.ok(src.includes(de), 'estrago nao aplicavel: ' + nome);
    writeFileSync(join(tmp, 'scripts', 'vigia-entradas.mjs'), src.replace(de, para));
    let apanhado = false;
    try { const m = await import(pathToFileURL(join(tmp, 'scripts', 'vigia-entradas.mjs')).href); await suite(m.vigiar); } catch { apanhado = true; }
    assert.ok(apanhado, 'estrago NAO apanhado: ' + nome);
    estragos += 1;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
await estraga('tudo o que chega e interno', "INTERNOS_BASE.has(minusculas(de)) ? 'interno' : 'por_classificar'", "'interno'");
await estraga('o desconhecido passa a externo', "INTERNOS_BASE.has(minusculas(de)) ? 'interno' : 'por_classificar'", "INTERNOS_BASE.has(minusculas(de)) ? 'interno' : 'externo'");
await estraga('classifica pelo destino em vez do pagador', 'classe: classificarBase(x.de)', 'classe: classificarBase(x.para)');
await estraga('entradas mistas contam como internas', 'pagadores.every((a) => INTERNOS_BTC.has(a))', 'pagadores.some((a) => INTERNOS_BTC.has(a))');
await estraga('conta saidas como entradas', 'if (recebido <= 0) continue;', '');
await estraga('ignora a janela no Bitcoin', 'if (st.confirmed && Number(st.block_time) < desde) continue;', '');
await estraga('aceita qualquer token', 'if (minusculas(l.address) !== USDC) continue;', '');
await estraga('aceita destinos que nao sao nossos', 'if (!VIGIADOS.base.includes(minusculas(para))) continue;', '');
await estraga('nao tira duplicados', 'if (vistos.has(chave)) continue;', '');
await estraga('janela da Base ignorada', 'Math.ceil(horas * BLOCOS_POR_HORA)', '100000000');
await estraga('falha de leitura conta como completa', 'return { entradas, completa: lacunas.length === 0, lacunas };', 'return { entradas, completa: true, lacunas };');
await estraga('ausencia provada sem leitura completa', 'ausencia_provada_na_janela: todas.length === 0 && lacunas.length === 0', 'ausencia_provada_na_janela: todas.length === 0');
await estraga('volta a notificar o que ja foi visto', 'const novas = todas.filter((e) => !vistos.has(minusculas(e.tx)));', 'const novas = todas;');
await estraga('a nota deixa de negar o sustento', 'não é sustento nem receita', 'é sustento');
await estraga('o Bitcoin perde a segunda fonte', "{ nome: 'blockstream', base: 'https://blockstream.info/api' }", "{ nome: 'mempool.space', base: 'https://mempool.space/api' }");

await estraga('o intervalo por ler nunca é dito', 'temUltima && ultMs < janelaDesdeMs', 'false');
await estraga('ausência provada ignora o intervalo por ler', 'temUltima && !naoCoberto && todas.length === 0', 'temUltima && todas.length === 0');
await estraga('ausência provada ignora as lacunas de leitura', 'todas.length === 0 && lacunas.length === 0,\n    proxima', 'todas.length === 0,\n    proxima');
await estraga('leitura incompleta avança a referência', 'completa ? new Date(agora).toISOString()', 'true ? new Date(agora).toISOString()');
await estraga('sem última leitura afirma continuidade', 'continua_desde_ultima_leitura: temUltima && !naoCoberto', 'continua_desde_ultima_leitura: !naoCoberto');
await estraga('data inválida aceita-se', "if (ultimaLeitura && Number.isNaN(ultMs)) throw new Error('ultima leitura invalida: ' + ultimaLeitura);", '');

console.log(JSON.stringify({ verified: true, estragos_apanhados: estragos,
  prova: 'lista o que entra nas carteiras (Base: USDC verdadeiro, destino nosso, sem duplicados; Bitcoin: so o que entra, duas fontes), classifica o pagador como interno ou por classificar sem nunca lhe chamar sustento/receita/externo, respeita a janela, e nao transforma leitura incompleta em zero; diz o intervalo por ler entre a ultima leitura e a janela, e nao o conta como ausencia provada',
  nao_prova: 'que alguem pague; que a leitura cubra mais de ~5 h na Base (os RPC publicos gratuitos so servem logs recentes); nem a classificacao de um pagador desconhecido' }));
