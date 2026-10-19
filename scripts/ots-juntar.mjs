// Junta a resposta de um calendário OpenTimestamps ao ramo pendente do mesmo calendário num recibo.
// Recusa se os bytes não tiverem o sha256 que a sandbox mediu ao receber a resposta (apanha erros de cópia).
// Uso: node scripts/ots-juntar.mjs <recibo.ots> <url-do-calendario> <resposta.b64> <sha256-esperado>
import crypto from 'node:crypto';
import fs from 'node:fs';
import { lerRecibo } from './lib/ots.mjs';

const TAG_PENDENTE = '83dfe30d2ef90c8e';

// Devolve o recibo novo (Buffer). Lança Error se algo não bate; não escreve nada.
export function juntar(recibo, url, respostaBytes, sha256Esperado) {
  if (!/^[0-9a-f]{64}$/.test(sha256Esperado)) throw new Error('sha256 esperado inválido');
  const sha = crypto.createHash('sha256').update(respostaBytes).digest('hex');
  if (sha !== sha256Esperado) throw new Error(`a resposta não tem o sha256 medido no calendário (${sha.slice(0, 12)}… ≠ ${sha256Esperado.slice(0, 12)}…): erro de cópia?`);
  const u = Buffer.from(url);
  const i = recibo.indexOf(u);
  if (i < 0) throw new Error(`o recibo não menciona ${url}`);
  const inicio = i - 11, fim = i + u.length;
  if (inicio < 0 || recibo[inicio] !== 0 || recibo.subarray(inicio + 1, inicio + 9).toString('hex') !== TAG_PENDENTE) throw new Error(`o ramo de ${url} já não está pendente`);
  const novo = Buffer.concat([recibo.subarray(0, inicio), respostaBytes, recibo.subarray(fim)]);
  const antes = lerRecibo(recibo), depois = lerRecibo(novo);
  if (antes.digest !== depois.digest) throw new Error('o hash selado mudou');
  if (depois.atestacoes.some((a) => a.tipo === 'desconhecida')) throw new Error('atestação desconhecida depois de juntar');
  return novo;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const [, , reciboPath, url, respostaPath, sha] = process.argv;
  const resposta = Buffer.from(fs.readFileSync(respostaPath, 'utf8').replace(/\s+/g, ''), 'base64');
  const novo = juntar(fs.readFileSync(reciboPath), url, resposta, sha);
  fs.writeFileSync(reciboPath, novo);
  const r = lerRecibo(novo);
  console.log(`${reciboPath}: ${novo.length} bytes; ${JSON.stringify(r.atestacoes.map((a) => (a.tipo === 'bitcoin' ? { t: a.tipo, altura: a.altura } : { t: a.tipo, c: a.calendario })))}`);
}
