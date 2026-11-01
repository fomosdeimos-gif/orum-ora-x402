// @weave_hands_ancora · lógica pura (sem rede, sem Deno): leitor mínimo de recibos OpenTimestamps (cópia de scripts/lib/ots.mjs),
// lista de calendários admitidos e classificação do que um calendário responde. O verificador
// (scripts/verify-weave-hands-ancora.mjs) prova que o leitor dá o mesmo que o do repositório em todos os recibos reais.
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const MAGIC = Buffer.from('004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294', 'hex');
const TAG_PENDING = '83dfe30d2ef90c8e';
const TAG_BITCOIN = '0588960d73d71901';
const HASHES = { 0x08: 'sha256', 0x02: 'sha1', 0x03: 'ripemd160' };

function reader(buf) {
  let pos = 0;
  const need = (n) => { if (pos + n > buf.length) throw new Error('recibo truncado'); };
  return {
    byte() { need(1); return buf[pos++]; },
    bytes(n) { need(n); const out = buf.subarray(pos, pos + n); pos += n; return out; },
    varuint() {
      let value = 0, shift = 0;
      for (;;) { const b = this.byte(); value += (b & 0x7f) * 2 ** shift; if (!(b & 0x80)) return value; shift += 7; if (shift > 49) throw new Error('varuint demasiado grande'); }
    },
    varbytes() { return this.bytes(this.varuint()); },
    done() { return pos === buf.length; },
  };
}
function walk(r, msg, out) {
  for (;;) {
    const tag = r.byte();
    if (tag === 0xff) { walk(r, msg, out); continue; }
    if (tag === 0x00) {
      const kind = r.bytes(8).toString('hex');
      const payload = r.varbytes();
      if (kind === TAG_PENDING) {
        const p = reader(payload);
        out.push({ tipo: 'pendente', calendario: p.varbytes().toString('utf8'), compromisso: msg.toString('hex') });
      } else if (kind === TAG_BITCOIN) {
        out.push({ tipo: 'bitcoin', altura: reader(payload).varuint(), raiz_a_comparar_com_o_bloco: msg.toString('hex') });
      } else out.push({ tipo: 'desconhecida', tag: kind });
      return;
    }
    if (tag === 0xf0) msg = Buffer.concat([msg, r.varbytes()]);
    else if (tag === 0xf1) msg = Buffer.concat([r.varbytes(), msg]);
    else if (tag === 0xf2) msg = Buffer.from(msg).reverse();
    else if (tag === 0xf3) msg = Buffer.from(msg.toString('hex'));
    else if (HASHES[tag]) msg = crypto.createHash(HASHES[tag]).update(msg).digest();
    else throw new Error(`operação desconhecida 0x${tag.toString(16)}`);
  }
}
export function lerRecibo(buf) {
  const r = reader(buf);
  if (!r.bytes(MAGIC.length).equals(MAGIC)) throw new Error('cabeçalho OpenTimestamps inválido');
  if (r.byte() !== 1) throw new Error('versão do recibo não suportada');
  if (r.byte() !== 0x08) throw new Error('só se aceita sha256 como hash do ficheiro');
  const digest = Buffer.from(r.bytes(32));
  const atestacoes = [];
  walk(r, digest, atestacoes);
  if (!r.done()) throw new Error('bytes a mais depois do recibo');
  return { digest: digest.toString('hex'), atestacoes };
}

// O texto do recibo vem de fora: só se pergunta a estes calendários (nunca a um URL escrito no recibo).
export const CALENDARIOS = ['https://alice.btc.calendar.opentimestamps.org', 'https://bob.btc.calendar.opentimestamps.org', 'https://finney.calendar.eternitywall.com'];
export const FONTES_RECIBO = (n) => [`https://raw.githubusercontent.com/fomosdeimos-gif/orum-ora-x402/main/ancora/raiz-registos-${n}.ots`, `https://ora-x402-gateway.vercel.app/ancora/raiz-registos-${n}.ots`];
export const ESPLORA = { mempool: 'https://mempool.space/api', blockstream: 'https://blockstream.info/api' };
export const MAX_CAMADAS = 8;

export const calendarioAdmitido = (url) => CALENDARIOS.includes(String(url).replace(/\/+$/, ''));
export const compromissoValido = (hex) => typeof hex === 'string' && /^[0-9a-f]{2,128}$/.test(hex) && hex.length % 2 === 0;

// Classifica uma resposta de GET /timestamp/<compromisso>. Só "prova_disponivel" (200) é uma prova para juntar; nunca é âncora por si.
export function classificarResposta(status, texto) {
  if (status === 200) return { estado: 'prova_disponivel' };
  const t = String(texto ?? '');
  const m = /Timestamped by transaction ([0-9a-f]{64}); waiting for (\d+) confirmations/.exec(t);
  if (status === 404 && m) return { estado: 'tx_sem_bloco', txid: m[1], confirmacoes_pedidas: Number(m[2]) };
  if (status === 404 && /Pending confirmation in Bitcoin blockchain/.test(t)) return { estado: 'pendente' };
  return { estado: 'resposta_inesperada', http: status };
}
// confirmações de uma transacção a partir do /tx/<id>/status e da altura do topo; null se não confirmada ou ilegível.
export function confirmacoes(status, topo) {
  if (!status || status.confirmed !== true || !Number.isInteger(status.block_height) || !Number.isInteger(topo) || topo < status.block_height) return null;
  return topo - status.block_height + 1;
}
// Estado de uma camada: bitcoin se alguma atestação já é Bitcoin; senão o melhor estado dos ramos pendentes.
export function estadoDaCamada(ramos) {
  if (ramos.some((r) => r.estado === 'bitcoin')) return 'bitcoin_no_recibo';
  if (ramos.some((r) => r.estado === 'prova_disponivel')) return 'prova_por_juntar';
  if (ramos.some((r) => r.estado === 'tx_sem_bloco')) return 'tx_sem_bloco';
  if (ramos.some((r) => r.estado === 'pendente')) return 'pendente';
  return 'sem_leitura';
}
