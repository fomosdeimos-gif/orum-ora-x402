// Verificador autónomo do espelho de máquinas (só Node, sem dependências, sem rede, sem git, sem a ORA).
// Uso: node kit/espelho-maquinas.mjs <manifesto.json> <orum-maquinas-v1.tar | pasta com os ficheiros>
// Confere: o sha256 do tar; que cada ficheiro tem o sha256 e o tamanho que o manifesto diz; que não há ficheiros a mais nem a menos;
// que a raiz (sha256 do texto "<caminho>\t<sha256>\n" por linha, ordenado por caminho) é a do manifesto; e que nenhum ficheiro é de uma lista proibida.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const PROIBIDOS = [/^CLAUDE\.md$/, /^HANDOFF\.md$/, /^identity\/espelho\.json$/, /^token\/moedas/, /^openapi\.json$/, /^llms\.txt$/, /^\.well-known\//, /^recovery\//, /^presenca\//, /^discovery\/(ora-mcp-auto|orum-connectors|weave-hands-writer)\.json$/, /(^|\/)\.env/, /\.(pem|key)$/];
const PADROES_SENSIVEIS = [/[A-Za-z0-9._+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}/, /s[k]_live[A-Za-z0-9_]*/, /sk-[A-Za-z0-9]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/];

// Leitor mínimo de tar ustar (cabeçalhos de 512 bytes). Só lê ficheiros normais.
export function lerTar(buf) {
  const membros = new Map(); let i = 0;
  while (i + 512 <= buf.length) {
    const h = buf.subarray(i, i + 512);
    if (h.every((b) => b === 0)) break;
    const nome = h.subarray(0, 100).toString('latin1').replace(/\0.*$/s, '');
    const tamanho = parseInt(h.subarray(124, 136).toString('latin1').replace(/\0.*$/s, '').trim() || '0', 8);
    const tipo = String.fromCharCode(h[156] || 48);
    let soma = 0; for (let k = 0; k < 512; k++) soma += k >= 148 && k < 156 ? 32 : h[k];
    if (soma !== parseInt(h.subarray(148, 156).toString('latin1').replace(/\0.*$/s, '').trim(), 8)) throw new Error(`cabeçalho corrompido em ${nome}`);
    if (tipo !== '0') throw new Error(`tipo de entrada não admitido em ${nome}`);
    if (membros.has(nome)) throw new Error(`ficheiro repetido no tar: ${nome}`);
    membros.set(nome, buf.subarray(i + 512, i + 512 + tamanho));
    i += 512 + Math.ceil(tamanho / 512) * 512;
  }
  return membros;
}
export const raizDe = (lista) => sha256(Buffer.from([...lista].sort((a, b) => Buffer.compare(Buffer.from(a.caminho), Buffer.from(b.caminho))).map((e) => `${e.caminho}\t${e.sha256}\n`).join('')));

export function verificar(manifestoTxt, { tar, membros }) {
  const m = JSON.parse(manifestoTxt);
  if (m.schema !== 'orum-espelho-maquinas/v1') throw new Error('schema desconhecido');
  if (tar && sha256(tar) !== m.tar.sha256) throw new Error('o sha256 do tar não é o do manifesto');
  if (tar && tar.length !== m.tar.bytes) throw new Error('o tamanho do tar não é o do manifesto');
  const ditos = new Map(m.ficheiros.map((f) => [f.caminho, f]));
  if (ditos.size !== m.ficheiros.length) throw new Error('caminho repetido no manifesto');
  for (const [c, f] of ditos) {
    if (PROIBIDOS.some((r) => r.test(c))) throw new Error(`ficheiro proibido no manifesto: ${c}`);
    if (!/^[A-Za-z0-9._\/-]+$/.test(c) || c.startsWith('/') || c.includes('..')) throw new Error(`caminho inválido: ${c}`);
    const b = membros.get(c); if (!b) throw new Error(`falta o ficheiro ${c}`);
    if (sha256(b) !== f.sha256) throw new Error(`${c} não tem o sha256 do manifesto`);
    if (b.length !== f.bytes) throw new Error(`${c} não tem o tamanho do manifesto`);
    const txt = b.toString('utf8'); for (const p of PADROES_SENSIVEIS) if (p.test(txt)) throw new Error(`${c} contém algo que parece dado pessoal ou segredo (${p})`);
  }
  for (const c of membros.keys()) if (!ditos.has(c)) throw new Error(`ficheiro a mais: ${c}`);
  if (raizDe(m.ficheiros) !== m.raiz_sha256) throw new Error('a raiz não é a do manifesto');
  return { ficheiros: ditos.size, raiz: m.raiz_sha256, tar_sha256: m.tar.sha256 };
}

function carregarPasta(dir) {
  const membros = new Map();
  const ler = (d, rel = '') => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) ler(p, r); else membros.set(r, fs.readFileSync(p)); } };
  ler(dir); return membros;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , manifesto, alvo] = process.argv;
  if (!manifesto || !alvo) { console.error('uso: node kit/espelho-maquinas.mjs <manifesto.json> <orum-maquinas-v1.tar | pasta>'); process.exit(2); }
  try {
    const st = fs.statSync(alvo);
    const r = st.isDirectory() ? verificar(fs.readFileSync(manifesto, 'utf8'), { membros: carregarPasta(alvo) }) : (() => { const tar = fs.readFileSync(alvo); return verificar(fs.readFileSync(manifesto, 'utf8'), { tar, membros: lerTar(tar) }); })();
    console.log(`OK espelho de máquinas: ${r.ficheiros} ficheiros conferidos; raiz ${r.raiz}`);
  } catch (e) { console.error(`FALHA: ${e.message}`); process.exit(1); }
}
