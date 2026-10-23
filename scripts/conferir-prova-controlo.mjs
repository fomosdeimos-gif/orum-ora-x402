// Confere ancora/prova-controlo-btc-operacional.json com o verificador independente (provado nos vectores oficiais do BIP-322).
import fs from 'node:fs';
import { verificarBip322P2wpkh } from './lib/bip322-p2wpkh.mjs';
const p = JSON.parse(fs.readFileSync(new URL('../ancora/prova-controlo-btc-operacional.json', import.meta.url), 'utf8'));
const certa = verificarBip322P2wpkh(p.endereco, p.mensagem, p.assinatura);
const alterada = verificarBip322P2wpkh(p.endereco, p.mensagem + ' ', p.assinatura);
console.log(JSON.stringify({ endereco: p.endereco, assinatura_valida: certa.ok, mensagem_alterada_recusada: alterada.ok === false }));
process.exit(certa.ok && alterada.ok === false ? 0 : 1);
