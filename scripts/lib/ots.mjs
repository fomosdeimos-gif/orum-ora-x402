// Leitor mínimo de recibos OpenTimestamps (.ots). Só lê e calcula; não fala com a rede.
import crypto from 'node:crypto';

const MAGIC = Buffer.from('004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294', 'hex');
const TAG_PENDING = '83dfe30d2ef90c8e';
const TAG_BITCOIN = '0588960d73d71901';
const HASHES = { 0x08: 'sha256', 0x02: 'sha1', 0x03: 'ripemd160' };

function reader(buf) {
  let pos = 0;
  const need = (n) => { if (pos + n > buf.length) throw new Error('recibo truncado'); };
  return {
    get pos() { return pos; },
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
