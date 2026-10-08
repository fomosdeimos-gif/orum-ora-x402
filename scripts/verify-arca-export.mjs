// Verifica uma copia exportada da arca-fisica contra docs/licenca/manifesto-arca-fisica-v1.tsv.
// Uso: node scripts/verify-arca-export.mjs <pasta-com-N.jpg>
// Sem rede, sem chaves: a integridade da copia nao depende do fornecedor que a serviu.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const dir = process.argv[2];
if (!dir) { console.error('uso: node scripts/verify-arca-export.mjs <pasta>'); process.exit(2); }
const manifesto = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/licenca/manifesto-arca-fisica-v1.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'));
let ok = 0; const falhas = [];
for (const [id, bytes, sha] of manifesto) {
  const f = join(dir, `${id}.jpg`);
  if (!existsSync(f)) { falhas.push(`${id}: ausente`); continue; }
  if (statSync(f).size !== Number(bytes)) { falhas.push(`${id}: tamanho ${statSync(f).size} != ${bytes}`); continue; }
  if (createHash('sha256').update(readFileSync(f)).digest('hex') !== sha) { falhas.push(`${id}: sha256 diferente`); continue; }
  ok++;
}
console.log(`arca-export: ${ok}/${manifesto.length} verificadas`);
if (falhas.length) { console.error(falhas.join('\n')); process.exit(1); }
