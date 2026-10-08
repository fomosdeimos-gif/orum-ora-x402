// Exporta a arca-fisica do Supabase para uma pasta local, verificando cada ficheiro
// contra docs/licenca/manifesto-arca-fisica-v1.tsv. Retomavel: o que ja esta verificado
// na pasta nao volta a ser descarregado. Para no primeiro 402 (quota de egress).
// Uso: SUPABASE_SERVICE_ROLE_KEY=... node scripts/export-arca.mjs <pasta> [url-base]
// A chave e lida do ambiente e nunca escrita nem impressa.
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const dir = process.argv[2];
const base = (process.argv[3] || 'https://ywabnlhkmhbyewqhbsjm.supabase.co').replace(/\/$/, '');
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dir || !chave) { console.error('uso: SUPABASE_SERVICE_ROLE_KEY=... node scripts/export-arca.mjs <pasta> [url-base]'); process.exit(2); }
mkdirSync(dir, { recursive: true });
const manifesto = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/licenca/manifesto-arca-fisica-v1.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
let feitas = 0, saltadas = 0;
for (const [id, bytes, esperado] of manifesto) {
  const f = join(dir, `${id}.jpg`);
  if (existsSync(f) && statSync(f).size === Number(bytes) && sha(readFileSync(f)) === esperado) { saltadas++; continue; }
  const r = await fetch(`${base}/storage/v1/object/arca-fisica/${id}.jpg`, { headers: { Authorization: `Bearer ${chave}`, apikey: chave } });
  if (r.status === 402) { console.error(`parou em ${id}: 402 (quota de egress). ${feitas} descarregadas, ${saltadas} ja existiam.`); process.exit(3); }
  if (!r.ok) { console.error(`${id}: HTTP ${r.status}`); process.exit(1); }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length !== Number(bytes) || sha(buf) !== esperado) { console.error(`${id}: bytes/sha256 nao coincidem com o manifesto; nao gravado`); process.exit(1); }
  writeFileSync(f, buf); feitas++;
}
console.log(`export-arca: ${feitas} descarregadas, ${saltadas} ja verificadas, total ${manifesto.length}`);
