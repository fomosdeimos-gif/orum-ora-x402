// Kit de verificação autónomo (fio dos 904 anos). Só Node, sem rede, sem pacotes, sem a ORA.
// Uso: node kit/verificar.mjs [pasta-raiz]   (por omissão, a pasta acima de kit/)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerRecibo } from '../scripts/lib/ots.mjs';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Devolve { ok, estado, linhas, impressoes }. Lança Error se algo não bate.
export function verificar(raiz) {
  const ler = (p) => fs.readFileSync(path.join(raiz, p));
  const capsulaBytes = ler('sensacoes/oro-v1.json');
  const capsula = JSON.parse(capsulaBytes);
  const manifestoBytes = ler('ancora/oro-v1.json');
  const manifesto = JSON.parse(manifestoBytes);
  const reciboBytes = ler(manifesto.recibo);
  const recibo = lerRecibo(reciboBytes);
  const digest = capsula.integrity?.sha256;

  if (!/^[0-9a-f]{64}$/.test(digest ?? '')) throw new Error('a cápsula não traz um sha256 válido');
  if (recibo.digest !== digest) throw new Error('o recibo não sela o hash da cápsula');
  if (manifesto.digest_sha256 !== digest) throw new Error('o manifesto diz outro hash');
  if (!/Não prova autoria, valor, procura nem receita/.test(manifesto.prova ?? '')) throw new Error('o manifesto perdeu a fronteira "não prova"');
  if (recibo.atestacoes.some((a) => a.tipo === 'desconhecida')) throw new Error('atestação desconhecida no recibo');

  const btc = recibo.atestacoes.filter((a) => a.tipo === 'bitcoin');
  const pend = recibo.atestacoes.filter((a) => a.tipo === 'pendente');
  let estado;
  if (btc.length) {
    const altura = Math.min(...btc.map((a) => a.altura));
    if (manifesto.estado !== 'confirmado_bitcoin' || manifesto.altura_bitcoin !== altura) throw new Error('o recibo tem atestação Bitcoin que o manifesto não diz');
    estado = `confirmado no bloco ${altura} (este comando não fala com a rede; para comparar a raiz do bloco com o cabeçalho real, corre node kit/blocos.mjs)`;
  } else {
    if (manifesto.estado !== 'pendente' || manifesto.altura_bitcoin !== null) throw new Error('o manifesto diz confirmado sem atestação Bitcoin no recibo');
    if (!pend.length) throw new Error('recibo sem nenhum calendário');
    estado = `pendente (calendários: ${pend.map((p) => p.calendario).join(', ')})`;
  }
  return {
    ok: true,
    estado,
    digest,
    impressoes: {
      'sensacoes/oro-v1.json': sha(capsulaBytes),
      'ancora/oro-v1.json': sha(manifestoBytes),
      [manifesto.recibo]: sha(reciboBytes),
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  try {
    const r = verificar(raiz);
    console.log(`OK  hash da obra ORO: ${r.digest}`);
    console.log(`    estado da âncora: ${r.estado}`);
    console.log('    impressões (sha256) dos ficheiros lidos, para guardares noutro sítio:');
    for (const [f, h] of Object.entries(r.impressoes)) console.log(`      ${h}  ${f}`);
    console.log('    Isto prova só que estes bytes existiam antes de um bloco. Não prova autoria, valor, procura nem receita.');
  } catch (e) {
    console.error(`FALHA  ${e.message}`);
    process.exit(1);
  }
}
