// Verificador BIP-322 "simple" para P2WPKH, feito com bitcoinjs-lib 7 e @noble/curves (independente do @scure/btc-signer que assina). Provado nos vectores oficiais do BIP-322 (scripts/verify-btc-prova-controlo.mjs).
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
// Dependências (bitcoinjs-lib 7 e @noble/curves) vêm de ORUM_BTC_DEPENDENCIES, como em scripts/verify-bitcoin-wallet.mjs.
const require = createRequire((process.env.ORUM_BTC_DEPENDENCIES || process.cwd()) + '/package.json');
const bitcoin = require('bitcoinjs-lib');
const { secp256k1 } = require('@noble/curves/secp256k1');

const sha256 = (b) => new Uint8Array(crypto.createHash('sha256').update(b).digest());
const enc = new TextEncoder();
const cat = (...xs) => { const o = new Uint8Array(xs.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of xs) { o.set(x, i); i += x.length; } return o; };
function lerVarint(b, i) { const n = b[i]; if (n < 0xfd) return [n, i + 1]; if (n === 0xfd) return [b[i + 1] | (b[i + 2] << 8), i + 3]; throw new Error('varint grande'); }

export function verificarBip322P2wpkh(address, message, sigB64) {
  const bytes = new Uint8Array(Buffer.from(sigB64, 'base64'));
  let [n, i] = lerVarint(bytes, 0);
  if (n !== 2) return { ok: false, motivo: 'a testemunha tem de ter 2 itens (assinatura e chave)' };
  const itens = [];
  for (let k = 0; k < n; k++) { let len; [len, i] = lerVarint(bytes, i); itens.push(bytes.slice(i, i + len)); i += len; }
  if (i !== bytes.length) return { ok: false, motivo: 'bytes a mais' };
  const [sigComTipo, pub] = itens;
  const pay = bitcoin.payments.p2wpkh({ address });
  if (Buffer.compare(Buffer.from(bitcoin.crypto.hash160(pub)), Buffer.from(pay.hash)) !== 0) return { ok: false, motivo: 'a chave nao corresponde ao endereco' };
  if (sigComTipo[sigComTipo.length - 1] !== 0x01) return { ok: false, motivo: 'tipo de assinatura nao e SIGHASH_ALL' };
  const tag = sha256(enc.encode('BIP0322-signed-message'));
  const msgHash = sha256(cat(tag, tag, enc.encode(message)));
  const toSpend = new bitcoin.Transaction();
  toSpend.version = 0; toSpend.locktime = 0;
  toSpend.addInput(new Uint8Array(32), 0xffffffff, 0, cat(Uint8Array.of(0x00, 0x20), msgHash));
  toSpend.addOutput(pay.output, 0n);
  const toSign = new bitcoin.Transaction();
  toSign.version = 0; toSign.locktime = 0;
  toSign.addInput(toSpend.getHash(), 0, 0);
  toSign.addOutput(Uint8Array.of(0x6a), 0n);
  const scriptCode = bitcoin.payments.p2pkh({ hash: pay.hash }).output;
  const hash = toSign.hashForWitnessV0(0, scriptCode, 0n, bitcoin.Transaction.SIGHASH_ALL);
  const der = sigComTipo.slice(0, -1);
  let valida = false;
  try { valida = secp256k1.verify(secp256k1.Signature.fromDER(der), hash, pub, { lowS: false }); } catch { valida = false; }
  return valida ? { ok: true } : { ok: false, motivo: 'assinatura invalida' };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const addr = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';
  const oficiais = [
    ['', 'AkcwRAIgM2gBAQqvZX15ZiysmKmQpDrG83avLIT492QBzLnQIxYCIBaTpOaD20qRlEylyxFSeEA2ba9YOixpX8z46TSDtS40ASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI='],
    ['Hello World', 'AkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI='],
  ];
  for (const [m, s] of oficiais) console.log('vetor oficial', JSON.stringify(m), '->', JSON.stringify(verificarBip322P2wpkh(addr, m, s)));
  console.log('vetor oficial com mensagem alterada ->', JSON.stringify(verificarBip322P2wpkh(addr, 'Hello World!', oficiais[1][1])));
}
