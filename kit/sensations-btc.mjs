// Elo 0001sensations ↔ Bitcoin: que ficheiros de sensacoes/ têm o seu hash dentro de uma camada da raiz
// confirmada no Bitcoin, e qual (só ORO) tem âncora directa. Sem pacotes, sem rede.
// Uso: node kit/sensations-btc.mjs [pasta] [--gerar]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const J = (dir, p) => JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8'));
const REGISTO = 'ancora/sensations-btc.json';
const FRONTEIRA = 'Liga ficheiros a blocos do Bitcoin: estes bytes existiam antes daquele bloco. Não prova autoria, valor, procura nem receita, e não faz do ORO nem de qualquer obra um activo com lastro.';
const NAO_COBRE = [
  'As 107 obras físicas e os 65 NFTs: o catálogo não está neste repositório, por isso nenhuma está ancorada por este registo.',
  'Os bytes da imagem do ORO são privados: só o seu hash é público, e a âncora directa sela esse hash.',
];

export function calcular(dir = '.') {
  const camadas = fs.readdirSync(path.join(dir, 'ancora')).filter((f) => /^raiz-registos(-\d+)?\.json$/.test(f)).map((f) => `ancora/${f}`)
    .sort((a, b) => Number(a.match(/-(\d+)\.json$/)?.[1] ?? 1) - Number(b.match(/-(\d+)\.json$/)?.[1] ?? 1));
  const manifestos = camadas.map((p) => ({ p, m: J(dir, p) })).filter((x) => x.m.estado === 'confirmado_bitcoin');
  const oro = J(dir, 'ancora/oro-v1.json');
  const ficheiros = fs.readdirSync(path.join(dir, 'sensacoes')).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const caminho = `sensacoes/${f}`;
    const atual = sha(fs.readFileSync(path.join(dir, caminho)));
    const camadasBtc = [];
    let alterada = false;
    for (const { p, m } of manifestos) {
      const e = m.ficheiros.find((x) => x.caminho === caminho);
      if (!e) continue;
      if (e.sha256 === atual) camadasBtc.push({ camada: m.camada ?? 1, manifesto: p, altura_bitcoin: m.altura_bitcoin });
      else alterada = true;
    }
    const r = { caminho, sha256: atual, estado: camadasBtc.length ? 'ancorado_em_camada' : alterada ? 'alterado_desde_a_ancora' : 'nao_ancorado', camadas: camadasBtc };
    if (caminho === 'sensacoes/oro-v1.json' && oro.estado === 'confirmado_bitcoin') r.ancora_directa = { manifesto: 'ancora/oro-v1.json', recibo: 'ancora/oro-v1.ots', altura_bitcoin: oro.altura_bitcoin, digest_sha256: oro.digest_sha256 };
    return r;
  });
  return { schema: 'orum-sensations-btc/v1', ficheiros, ancorados: ficheiros.filter((f) => f.estado === 'ancorado_em_camada').length, total: ficheiros.length, nao_cobre: NAO_COBRE, prova: FRONTEIRA };
}

export function verificar(dir = '.') {
  const real = calcular(dir);
  const guardado = J(dir, REGISTO);
  const e = [];
  if (JSON.stringify(guardado) !== JSON.stringify(real)) e.push('o registo guardado não bate com o que os ficheiros e as camadas dizem hoje');
  if (!/n[ãa]o prova/i.test(guardado.prova ?? '')) e.push('falta a fronteira "não prova"');
  if (!/107 obras/.test(JSON.stringify(guardado.nao_cobre ?? []))) e.push('falta dizer o que não cobre');
  if (/garant|lastro (?:de|em) btc|vale |reserva/i.test(JSON.stringify({ ...guardado, prova: '', nao_cobre: [] }))) e.push('promessa de valor ou lastro');
  if (e.length) throw new Error('elo inválido: ' + e.join('; '));
  return { ok: true, ancorados: real.ancorados, total: real.total, nao_ancorados: real.ficheiros.filter((f) => f.estado !== 'ancorado_em_camada').map((f) => f.caminho) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
  try {
    if (process.argv.includes('--gerar')) { fs.writeFileSync(path.join(dir, REGISTO), JSON.stringify(calcular(dir), null, 2) + '\n'); console.log('gerado ' + REGISTO); }
    console.log(JSON.stringify(verificar(dir)));
  } catch (err) { console.error(err.message); process.exit(1); }
}
