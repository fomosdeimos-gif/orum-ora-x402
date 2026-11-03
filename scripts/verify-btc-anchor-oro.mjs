// Verifica a acção btc_anchor_oro do executor operacional: uma transacção Bitcoin com OP_RETURN FIXO (prefixo + sha256 de token/oro.json)
// e troco para a própria carteira, sem terceiros. A transacção assinada é lida por um analisador independente (bitcoinjs-lib 7),
// com estragos propositados que têm de ser apanhados. Rede e cofre são simulados; nenhuma transacção real é assinada.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { handler } from '../supabase/functions/ora-operational-wallet/core.mjs';

const require = createRequire((process.env.ORUM_BTC_DEPENDENCIES || process.cwd()) + '/package.json');
const btc = require('@scure/btc-signer'), { pubECDSA } = require('@scure/btc-signer/utils');
const bitcoin = require('bitcoinjs-lib');
const FONTE = path.resolve('supabase/functions/ora-operational-wallet/bitcoin.mjs');
const DESTINO_SAGRADA = 'bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf';
const GENESIS = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest();

// Conteúdo esperado, calculado aqui e não no código a verificar.
const ORO_SHA = sha256(fs.readFileSync('token/oro.json')).toString('hex');
const PAYLOAD = Buffer.concat([Buffer.from('ORUM-ORO-v1'), Buffer.from(ORO_SHA, 'hex')]);
const SCRIPT_ESPERADO = bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, PAYLOAD]);
assert.equal(PAYLOAD.length, 43);

const key = new Uint8Array(32).fill(5), pub = pubECDSA(key, true), pay = btc.p2wpkh(pub);
const wallet = { address: pay.address, public_key: toHex(pub) };
const bloco = 'b'.repeat(64);

async function correr(ficheiro, { action = 'btc_anchor_oro', valores = [10402], confirmacoes = 20, taxa = 1, chaveDeOutro = false, jaGasta = false, idErrado = false } = {}) {
  const mod = await import(pathToFileURL(ficheiro).href + '?v=' + Math.random());
  // transacções anteriores fictícias que pagam à carteira, cada uma com txid próprio
  const lista = valores.map((v, i) => {
    const t = new btc.Transaction({ version: 2, allowUnknownInputs: true, allowUnknownOutputs: true, disableScriptCheck: true });
    t.addOutput({ script: pay.script, amount: BigInt(v) });
    t.addInput({ txid: new Uint8Array(32).fill(7 + i), index: 0, sequence: 0xffffffff, finalScriptSig: new Uint8Array([0x51]) });
    return { id: t.id, hex: t.hex, valor: v };
  });
  const topo = 1000;
  const alt = topo - confirmacoes + 1;
  let keyReads = 0, rpcs = [], difundidas = [], lidas = [];
  const rpc = async (nome) => {
    rpcs.push(nome);
    if (nome === 'ora_btc_wallet_v1') return wallet;
    if (nome === 'ora_btc_key_v1') { keyReads++; return toHex(chaveDeOutro ? new Uint8Array(32).fill(9) : key); }
    throw Error('rpc_inesperado_' + nome);
  };
  const net = {
    get: async (i, p) => {
      if (p === '/block-height/0') return GENESIS;
      if (p === '/blocks/tip/height') return String(topo);
      if (p === '/fee-estimates') return { 6: taxa };
      if (p.startsWith('/address/') && p.endsWith('/utxo')) return lista.map((x) => ({ txid: x.id, vout: 0, value: x.valor, status: { confirmed: confirmacoes > 0, block_height: alt, block_hash: bloco } }));
      let m;
      if ((m = /^\/tx\/([a-f0-9]{64})\/hex$/.exec(p))) return lista.find((x) => x.id === m[1]).hex;
      if (/^\/tx\/[a-f0-9]{64}\/outspend\/0$/.test(p)) return { spent: jaGasta };
      if (p === '/block-height/' + alt) return bloco;
      throw Error('rota_inesperada_' + p);
    },
    broadcast: async (raw) => { difundidas.push(raw); return idErrado ? '0'.repeat(64) : bitcoin.Transaction.fromHex(raw).getId(); },
  };
  const vistas = [];
  const espia = (k, c) => { vistas.push(k); return pubECDSA(k, c); };
  const acao = mod.bitcoinHandler({ btc, pubECDSA: espia });
  const r = await acao({ action }, { rpc, net });
  return { r, keyReads, rpcs, difundidas, vistas, lista, mod };
}

// O que uma execução boa tem de cumprir, lido por um analisador independente.
async function conferir(ficheiro, opts) {
  const x = await correr(ficheiro, opts);
  assert.equal(x.r.status, 202, 'estado 202: ' + JSON.stringify(x.r));
  assert.equal(x.difundidas.length, 1, 'uma difusão');
  const tx = bitcoin.Transaction.fromHex(x.difundidas[0]);
  assert.equal(tx.getId(), x.r.txid, 'txid devolvido é o da transacção');
  assert.equal(tx.outs.length, 2, 'duas saídas');
  assert.ok(Buffer.from(tx.outs[0].script).equals(Buffer.from(SCRIPT_ESPERADO)), 'saída 0 e o OP_RETURN fixo (prefixo + sha256 do registo)');
  assert.equal(BigInt(tx.outs[0].value), 0n, 'OP_RETURN sem valor');
  assert.ok(Buffer.from(tx.outs[1].script).equals(Buffer.from(bitcoin.address.toOutputScript(wallet.address))), 'troco para a propria carteira');
  assert.notDeepEqual(tx.outs.map((o) => toHex(o.script)).includes(toHex(bitcoin.address.toOutputScript(DESTINO_SAGRADA))), true, 'nada para a sagrada nem para terceiros');
  const gastas = tx.ins.map((i) => Buffer.from(i.hash).reverse().toString('hex'));
  assert.ok(gastas.length >= 1 && gastas.every((id) => x.lista.some((p) => p.id === id)), 'so gasta saidas da propria carteira');
  const entrada = gastas.reduce((n, id) => n + BigInt(x.lista.find((p) => p.id === id).valor), 0n);
  const fee = entrada - tx.outs.reduce((n, o) => n + BigInt(o.value), 0n);
  assert.ok(fee >= 1n && fee <= 5000n, 'taxa dentro do tecto: ' + fee);
  assert.ok(BigInt(tx.outs[1].value) >= 546n, 'troco acima do pó');
  assert.equal(x.r.funds_sent_to_third_party, false);
  assert.equal(x.r.record_sha256, ORO_SHA, 'o hash dito e o de token/oro.json');
  assert.equal(x.keyReads, 1, 'chave lida uma vez');
  assert.ok(x.vistas.every((k) => k.every((b) => b === 0)), 'chave zerada no fim');
  assert.deepEqual(x.rpcs, ['ora_btc_wallet_v1', 'ora_btc_key_v1'], 'sem escrever em registos');
  return x;
}
async function preview(ficheiro, opts) {
  const x = await correr(ficheiro, { ...opts, action: 'btc_anchor_preview' });
  assert.equal(x.r.status, 200); assert.equal(x.r.signed, false); assert.equal(x.r.submitted, false);
  assert.equal(x.difundidas.length, 0, 'preview nao difunde'); assert.equal(x.keyReads, 0, 'preview nao le a chave');
  return x;
}
async function recusas(ficheiro) {
  const r1 = await correr(ficheiro, { chaveDeOutro: true });
  assert.notEqual(r1.r.status, 202, 'chave de outra identidade: nao assina'); assert.equal(r1.difundidas.length, 0);
  const r2 = await correr(ficheiro, { confirmacoes: 3 });
  assert.notEqual(r2.r.status, 202, 'saidas com menos de 6 confirmacoes: nao se gastam'); assert.equal(r2.difundidas.length, 0);
  const r3 = await correr(ficheiro, { taxa: 500 });
  assert.notEqual(r3.r.status, 202, 'taxa de rede absurda: recusa'); assert.equal(r3.difundidas.length, 0);
  const r5 = await correr(ficheiro, { taxa: 40 });
  assert.notEqual(r5.r.status, 202, 'taxa de 40 sat/vB daria mais de 5000 sats: o tecto absoluto recusa'); assert.equal(r5.difundidas.length, 0);
  const r6 = await correr(ficheiro, { jaGasta: true });
  assert.notEqual(r6.r.status, 202, 'saida que as fontes dizem gasta: recusa'); assert.equal(r6.difundidas.length, 0);
  const r7 = await correr(ficheiro, { idErrado: true });
  assert.notEqual(r7.r.status, 202, 'difusao que devolve outro id: nao se da por feita');
  const r4 = await correr(ficheiro, { valores: [600] });
  assert.notEqual(r4.r.status, 202, 'fundos que nao cobrem a taxa mais o troco: recusa'); assert.equal(r4.difundidas.length, 0);
}

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// 1) O comportamento certo.
const real = await conferir(FONTE);
await conferir(FONTE, { valores: [3000, 4000, 5000] });
await preview(FONTE);
await recusas(FONTE);
const igual = await conferir(FONTE);
ok(igual.r.txid === real.r.txid, 'determinista (mesmas entradas, mesma transaccao)');
ok(real.mod.ORO_RECORD_SHA256 === ORO_SHA, 'o hash no codigo e o sha256 de token/oro.json');

// 2) A porta do núcleo só deixa passar { action }, com token.
let chamadas = 0;
const rota = handler({ rpc: async () => true, bitcoinAction: async () => { chamadas++; return { status: 200 }; } });
const pedido = (body, auth = true) => new Request('https://invalido', { method: 'POST', headers: auth ? { authorization: 'Bearer ' + 'a'.repeat(64) } : {}, body: JSON.stringify(body) });
ok((await rota(pedido({ action: 'btc_anchor_oro' }, false))).status === 401 && chamadas === 0, 'sem token: 401');
ok((await rota(pedido({ action: 'btc_anchor_oro', destino: 'bc1qx' }))).status === 400 && chamadas === 0, 'com destino do chamador: 400');
ok((await rota(pedido({ action: 'btc_anchor_oro', texto: 'x', amount_sats: '1000' }))).status === 400 && chamadas === 0, 'com texto ou montante do chamador: 400');
ok((await rota(pedido({ action: 'btc_anchor_oro' }))).status === 200 && chamadas === 1, 'so { action }: passa');

// 3) Estragos propositados: cada um tem de ser apanhado.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ancora-oro-'));
const original = fs.readFileSync(FONTE, 'utf8');
// Nota: a verificação de identidade da chave antes de assinar é uma segunda barreira; sem ela o @scure/btc-signer recusa na mesma assinar
// entradas de outra chave (coberto em recusas(): chaveDeOutro), por isso um estrago que a retire não muda o comportamento e não entra na lista.
const estragos = [
  ['prefixo do OP_RETURN trocado', "export const ORO_ANCHOR_PREFIX='ORUM-ORO-v1';", "export const ORO_ANCHOR_PREFIX='ORUM-ORO-v2';"],
  ['hash do registo trocado', "export const ORO_RECORD_SHA256='" + ORO_SHA + "';", "export const ORO_RECORD_SHA256='" + '0'.repeat(64) + "';"],
  ['troco para a sagrada em vez da operacional', 'tx.addOutputAddress(wallet.address,selection.change);\n ensure(tx.fee===selection.fee,\'bitcoin_fee_mismatch\');return tx;\n}\nexport function bitcoinHandler', "tx.addOutputAddress(BTC_DESTINATION,selection.change);\n ensure(tx.fee===selection.fee,'bitcoin_fee_mismatch');return tx;\n}\nexport function bitcoinHandler"],
  ['OP_RETURN com valor', "tx.addOutput({script:btc.Script.encode(['RETURN',anchorPayload()]),amount:0n});", "tx.addOutput({script:btc.Script.encode(['RETURN',anchorPayload()]),amount:546n});"],
  ['tecto da taxa removido', "ensure(selection.fee<=ANCHOR_MAX_FEE_SATS,'bitcoin_anchor_fee_too_high');", ''],
  ['troco abaixo do pó permitido', 'if(sum>=fee+546n)return {chosen,fee,change:sum-fee};', 'if(sum>=fee+1n)return {chosen,fee,change:sum-fee};'],
  ['gasta saidas sem as 6 confirmacoes', 'Math.min(...heads)-u.block_height+1>=6', 'Math.min(...heads)-u.block_height+1>=0'],
  ['chave nao zerada', "tx.sign(key);tx.finalize();}finally{key.fill(0);}\n     ensure(tx.isFinal&&tx.fee>=1n&&Number(tx.fee)/tx.vsize>=rate,'bitcoin_signed_fee_check');\n     txid=tx.id;\n     const broadcastId", "tx.sign(key);tx.finalize();}finally{}\n     ensure(tx.isFinal&&tx.fee>=1n&&Number(tx.fee)/tx.vsize>=rate,'bitcoin_signed_fee_check');\n     txid=tx.id;\n     const broadcastId"],
  ['o preview difunde', "if(body.action==='btc_anchor_preview')return {status:200,preview:true,...resumo,signed:false,submitted:false};", "if(body.action==='btc_anchor_preview'){await net.broadcast(tx.hex);return {status:200,preview:true,...resumo,signed:false,submitted:false};}"],
  ['declara envio a terceiros falso', "const resumo={address:wallet.address,op_return_hex:toHex(anchorPayload()),record_sha256:ORO_RECORD_SHA256,fee_sats:selection.fee.toString(),change_sats:selection.change.toString(),funds_sent_to_third_party:false};", "const resumo={address:wallet.address,op_return_hex:toHex(anchorPayload()),record_sha256:ORO_RECORD_SHA256,fee_sats:selection.fee.toString(),change_sats:selection.change.toString(),funds_sent_to_third_party:true};"],
  ['entradas nao validadas na cadeia', 'await validateInputs(btc,wallet,selection,net);\n    const tx=constructAnchor', 'const tx=constructAnchor'],
  ['id difundido nao conferido', "const broadcastId=await net.broadcast(tx.hex);ensure(broadcastId===txid,'bitcoin_broadcast_id_mismatch');\n     return {status:202,txid,state", "await net.broadcast(tx.hex);\n     return {status:202,txid,state"],
];
let apanhados = 0;
for (const [nome, de, para] of estragos) {
  assert.ok(original.includes(de), 'texto a estragar existe: ' + nome);
  const f = path.join(dir, 'bitcoin-' + apanhados + '.mjs');
  fs.writeFileSync(f, original.replace(de, para));
  let apanhou = false;
  try {
    await conferir(f); await preview(f); await recusas(f);
    const m = await import(pathToFileURL(f).href + '?v=' + Math.random());
    assert.equal(m.ORO_RECORD_SHA256, ORO_SHA, 'hash no codigo');
  } catch { apanhou = true; }
  assert.ok(apanhou, 'estrago nao apanhado: ' + nome);
  apanhados++;
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(`PASS: btc_anchor_oro escreve um OP_RETURN fixo (prefixo + sha256 de token/oro.json) e devolve o troco a operacional, sem terceiros; lido por analisador independente; taxa limitada; saidas com menos de 6 confirmacoes nao se gastam; ${apanhados} estragos propositados apanhados.`);
