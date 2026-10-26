// Acrescenta a livro/ora_mudancas.jsonl as linhas do livro que são novas ou mudaram (livro 1066 e seguinte).
// Uso: node scripts/exportar-livro.mjs <linhas.json> [AAAA-MM-DDTHH:MMZ]
// <linhas.json> é um array com as linhas lidas da tabela ora_mudancas (por exemplo o resultado de um select, guardado em ficheiro).
// Só lê o ficheiro dado e o da cópia; não liga à rede nem à base. Nunca altera linhas já copiadas: acrescenta instantâneos.
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CAMINHO, acrescentar, ler, validar } from './lib/livro.mjs';

const [entrada, quando] = process.argv.slice(2);
if (!entrada) { console.error('uso: node scripts/exportar-livro.mjs <linhas.json> [copiado_em]'); process.exit(2); }
const base = JSON.parse(readFileSync(entrada, 'utf8'));
if (!Array.isArray(base) || base.some((b) => b?.id == null)) { console.error('o ficheiro tem de ser um array de linhas com id'); process.exit(2); }
const texto = existsSync(CAMINHO) ? readFileSync(CAMINHO, 'utf8') : '';
const antes = validar(texto);
if (antes.erros.length) { console.error('a cópia existente não passa; não acrescento:', antes.erros); process.exit(1); }
const novas = acrescentar(ler(texto), base, quando ?? new Date().toISOString().slice(0, 16) + 'Z');
if (novas.length) {
  mkdirSync(dirname(CAMINHO), { recursive: true });
  appendFileSync(CAMINHO, (texto && !texto.endsWith('\n') ? '\n' : '') + novas.map((l) => JSON.stringify(l)).join('\n') + '\n');
}
const depois = validar(readFileSync(CAMINHO, 'utf8'), base);
if (depois.erros.length) { console.error('depois de acrescentar a cópia não passa:', depois.erros); process.exit(1); }
console.log(JSON.stringify({ acrescentadas: novas.length, linhas_na_copia: depois.linhas, ids: depois.ids, por_actualizar: depois.porActualizar.length }));
