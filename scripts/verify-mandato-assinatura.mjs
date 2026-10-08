// Verifica uma assinatura EIP-191 do mandato financeiro (docs/financeiro-mandato-v1.msg).
// Uso: node scripts/verify-mandato-assinatura.mjs <assinatura-0x...> [endereco-esperado]
//      node scripts/verify-mandato-assinatura.mjs --selftest
// Sem rede, sem chaves: so recupera o endereco que assinou e compara.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { recuperarEndereco } from './lib/eip191.mjs';
const ESPERADO = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const texto = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/financeiro-mandato-v1.msg'), 'utf8').replace(/\n+$/, '');
const [a, b] = process.argv.slice(2);
if (a === '--selftest') {
  // vector gerado com uma chave aleatoria descartavel (ethers), nao com chaves da ORUM
  const got = recuperarEndereco(texto, '0xa949f28d7198dde5b66e74f9ae9ac73cddc181a64c5c6312e98b3f135787c9d74611646e3f24dbf99fb1b882aa4f0cf11572621f38b0ae8383e858eddc3e12881b');
  if (got.toLowerCase() !== '0xaC20fBFd10821D4Fd160512d7e83a238ce2d1cbB'.toLowerCase()) { console.error('selftest FALHOU', got); process.exit(1); }
  console.log('mandato-assinatura selftest: ok');
  process.exit(0);
}
if (!a) { console.error('uso: node scripts/verify-mandato-assinatura.mjs <assinatura> [endereco]'); process.exit(2); }
const quem = recuperarEndereco(texto, a), alvo = (b || ESPERADO);
const ok = quem.toLowerCase() === alvo.toLowerCase();
console.log(JSON.stringify({ assinado_por: quem, esperado: alvo, valido: ok }));
process.exit(ok ? 0 : 1);
