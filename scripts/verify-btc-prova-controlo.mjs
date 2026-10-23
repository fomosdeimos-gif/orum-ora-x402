// Verifica a acção btc_prove_control do executor operacional: assinatura BIP-322 de mensagem FIXA, conferida por um verificador independente
// (bitcoinjs-lib + @noble/curves, provado nos vectores oficiais do BIP-322), com estragos propositados que têm de ser apanhados.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { verificarBip322P2wpkh } from './lib/bip322-p2wpkh.mjs';
import { handler } from '../supabase/functions/ora-operational-wallet/core.mjs';

const require = createRequire(process.env.ORUM_BTC_DEPENDENCIES + '/package.json');
const btc = require('@scure/btc-signer'), { pubECDSA } = require('@scure/btc-signer/utils');
const FONTE = path.resolve('supabase/functions/ora-operational-wallet/bitcoin.mjs');
const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// 1) O verificador independente aceita os vectores oficiais do BIP-322 e recusa uma mensagem alterada.
const oficial = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';
const sigVazia = 'AkcwRAIgM2gBAQqvZX15ZiysmKmQpDrG83avLIT492QBzLnQIxYCIBaTpOaD20qRlEylyxFSeEA2ba9YOixpX8z46TSDtS40ASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=';
const sigHello = 'AkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=';
ok(verificarBip322P2wpkh(oficial, '', sigVazia).ok === true, 'vector oficial mensagem vazia');
ok(verificarBip322P2wpkh(oficial, 'Hello World', sigHello).ok === true, 'vector oficial Hello World');
ok(verificarBip322P2wpkh(oficial, 'Hello World!', sigHello).ok === false, 'vector oficial com mensagem alterada recusado');

// 2) Corre a acção contra uma cópia (original ou mutada) de bitcoin.mjs.
async function correr(ficheiro, bodyExtra = {}, chaveDeOutro = false) {
  const mod = await import(pathToFileURL(ficheiro).href + '?v=' + Math.random());
  const key = new Uint8Array(32).fill(5), pub = pubECDSA(key, true), pay = btc.p2wpkh(pub);
  let wallet = { address: pay.address, public_key: toHex(pub) }, keyReads = 0, rpcs = [], broadcasts = 0, lida = null;
  const rpc = async (nome) => {
    rpcs.push(nome);
    if (nome === 'ora_btc_wallet_v1') return wallet;
    if (nome === 'ora_btc_key_v1') { keyReads++; return toHex(chaveDeOutro ? new Uint8Array(32).fill(9) : key); }
    throw Error('rpc_inesperado_' + nome);
  };
  const net = { get: async () => { throw Error('rede_nao_devia_ser_usada'); }, broadcast: async () => { broadcasts++; } };
  const vistas = [];
  const espia = (k, c) => { vistas.push(k); return pubECDSA(k, c); };
  const acao = mod.bitcoinHandler({ btc, pubECDSA: espia });
  const r = await acao({ action: 'btc_prove_control', ...bodyExtra }, { rpc, net });
  return { r, address: pay.address, keyReads, rpcs, broadcasts, mod, vistas };
}
async function conferir(ficheiro, bodyExtra = {}) {
  const x = await correr(ficheiro, bodyExtra);
  assert.equal(x.r.status, 200, 'estado 200');
  const esperada = x.mod.provaMensagem(x.address);
  assert.equal(x.r.message, esperada, 'mensagem e a fixa');
  assert.ok(x.r.message.includes(x.address) && x.r.message.startsWith('ORUM prova de controlo v1'), 'mensagem nomeia o endereco e a versao');
  assert.equal(x.r.address, x.address);
  assert.deepEqual(verificarBip322P2wpkh(x.address, esperada, x.r.signature), { ok: true }, 'assinatura passa no verificador independente');
  assert.equal(verificarBip322P2wpkh(x.address, esperada + ' ', x.r.signature).ok, false, 'mensagem alterada falha');
  const outro = btc.p2wpkh(pubECDSA(new Uint8Array(32).fill(6), true)).address;
  assert.equal(verificarBip322P2wpkh(outro, esperada, x.r.signature).ok, false, 'outro endereco falha');
  assert.equal(x.r.financial_transaction_signed, false); assert.equal(x.r.funds_sent, false);
  assert.ok(x.vistas.length > 0 && x.vistas.every((k) => k.every((b) => b === 0)), 'chave zerada no fim');
  assert.equal(x.keyReads, 1, 'chave lida uma vez'); assert.equal(x.broadcasts, 0, 'nada difundido');
  assert.deepEqual(x.rpcs, ['ora_btc_wallet_v1', 'ora_btc_key_v1'], 'sem escrever em registos nem tarefas');
  return x;
}
// Se a chave do cofre não for a da carteira registada, não assina.
async function recusaChaveDeOutro(ficheiro) {
  const x = await correr(ficheiro, {}, true);
  assert.notEqual(x.r.status, 200, 'chave de outra identidade: nao pode dar 200');
  assert.equal(x.r.signature, undefined, 'sem assinatura');
  assert.equal(x.r.error, 'bitcoin_signer_identity_mismatch');
}
await recusaChaveDeOutro(FONTE);
const real = await conferir(FONTE);
const outra = await conferir(FONTE);
ok(outra.r.signature === real.r.signature, 'determinista (RFC 6979)');
const comTexto = await conferir(FONTE, { message: 'outra coisa', amount_sats: '1000' });
ok(comTexto.r.message === real.r.message && comTexto.r.signature === real.r.signature, 'texto do chamador ignorado');

// 3) A porta do núcleo só deixa passar { action }.
let chamadas = 0;
const rota = handler({ rpc: async () => true, bitcoinAction: async () => { chamadas++; return { status: 200 }; } });
const pedido = (body, auth = true) => new Request('https://invalido', { method: 'POST', headers: auth ? { authorization: 'Bearer ' + 'a'.repeat(64) } : {}, body: JSON.stringify(body) });
ok((await rota(pedido({ action: 'btc_prove_control' }, false))).status === 401 && chamadas === 0, 'sem token: 401');
ok((await rota(pedido({ action: 'btc_prove_control', message: 'x' }))).status === 400 && chamadas === 0, 'com campo extra: 400');
ok((await rota(pedido({ action: 'btc_prove_control' }))).status === 200 && chamadas === 1, 'so { action }: passa');

// 4) Estragos propositados: cada um tem de ser apanhado.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prova-'));
const original = fs.readFileSync(FONTE, 'utf8');
const estragos = [
  ['mensagem vinda do chamador', "const message=provaMensagem(wallet.address);", "const message=body.message||provaMensagem(wallet.address);", { message: 'ola' }],
  ['mensagem sem o endereco', "export const provaMensagem=address=>PROVA_VERSAO+' · '+address+' · 2026-10-23';", "export const provaMensagem=address=>PROVA_VERSAO+' · 2026-10-23';"],
  ['etiqueta BIP-322 errada', "'BIP0322-signed-message'", "'BIP0322-signed-messagE'"],
  ['assinar sem confirmar a identidade da chave', "ensure(toHex(pubECDSA(key,true))===wallet.public_key,'bitcoin_signer_identity_mismatch');\n     const signature", "const signature"],
  ['chave nao zerada', "}finally{key.fill(0);}\n   }\n   if(['btc_create'", "}finally{}\n   }\n   if(['btc_create'"],
  ['difunde a transaccao', "return {status:200,proof:'bip322_simple_p2wpkh'", "await net.broadcast('00');return {status:200,proof:'bip322_simple_p2wpkh'"],
  ['declara fundos enviados', "financial_transaction_signed:false,funds_sent:false};\n    }finally", "financial_transaction_signed:true,funds_sent:true};\n    }finally"],
  ['testemunha sem a chave publica', "ensure(Array.isArray(w)&&w.length===2&&w.every(x=>x.length<0xfd),'bitcoin_prova_testemunha_invalida');", "w.pop();"],
];
let apanhados = 0;
for (const [nome, de, para, extra] of estragos) {
  assert.ok(original.includes(de), 'texto a estragar existe: ' + nome);
  const f = path.join(dir, 'bitcoin-' + apanhados + '.mjs');
  fs.writeFileSync(f, original.replace(de, para));
  let apanhou = false;
  try { await conferir(f, extra); if (nome.startsWith('assinar sem confirmar')) await recusaChaveDeOutro(f); } catch { apanhou = true; }
  assert.ok(apanhou, 'estrago nao apanhado: ' + nome);
  apanhados++;
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(`PASS: btc_prove_control assina mensagem fixa (BIP-322 simple, P2WPKH), verificada por verificador independente provado nos vectores oficiais; texto do chamador ignorado; chave lida uma vez; nada difundido; ${apanhados} estragos propositados apanhados.`);
