// Verificacao de assinaturas EIP-191 (personal_sign) sem dependencias: keccak256 e
// recuperacao de chave secp256k1 em BigInt. So verifica; nunca assina nem guarda chaves.
const M = (1n << 64n) - 1n;
const RC = [0x1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n, 0x808bn, 0x80000001n, 0x8000000080008081n, 0x8000000000008009n, 0x8an, 0x88n, 0x80008009n, 0x8000000an, 0x8000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x80000001n, 0x8000000080008008n];
const ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]];
const rotl = (x, n) => n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M;
function f1600(s) {
  for (let r = 0; r < 24; r++) {
    const C = []; for (let x = 0; x < 5; x++) C[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
    for (let x = 0; x < 5; x++) { const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1); for (let y = 0; y < 25; y += 5) s[y + x] ^= D; }
    const B = new Array(25);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROT[x][y]);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + 5 * y] = B[x + 5 * y] ^ (~B[(x + 1) % 5 + 5 * y] & M & B[(x + 2) % 5 + 5 * y]);
    s[0] ^= RC[r];
  }
}
export function keccak256(bytes) {
  const rate = 136, s = new Array(25).fill(0n);
  const p = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate); p.set(bytes); p[bytes.length] ^= 0x01; p[p.length - 1] ^= 0x80;
  for (let o = 0; o < p.length; o += rate) { for (let i = 0; i < rate / 8; i++) { let v = 0n; for (let b = 7; b >= 0; b--) v = (v << 8n) | BigInt(p[o + i * 8 + b]); s[i] ^= v; } f1600(s); }
  const out = new Uint8Array(32); for (let i = 0; i < 32; i++) out[i] = Number((s[i >> 3] >> BigInt(8 * (i & 7))) & 0xffn); return out;
}
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn, N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const mod = (a, m = P) => ((a % m) + m) % m;
function inv(a, m = P) { let [r0, r1, s0, s1] = [mod(a, m), m, 1n, 0n]; while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; } return mod(s0, m); }
function add(a, b) {
  if (!a) return b; if (!b) return a;
  if (a[0] === b[0]) { if (mod(a[1] + b[1]) === 0n) return null; const l = mod(3n * a[0] * a[0] * inv(2n * a[1])); const x = mod(l * l - 2n * a[0]); return [x, mod(l * (a[0] - x) - a[1])]; }
  const l = mod((b[1] - a[1]) * inv(b[0] - a[0])); const x = mod(l * l - a[0] - b[0]); return [x, mod(l * (a[0] - x) - a[1])];
}
function mul(k, pt) { let r = null, q = pt; while (k > 0n) { if (k & 1n) r = add(r, q); q = add(q, q); k >>= 1n; } return r; }
const pow = (b, e, m) => { let r = 1n; b = mod(b, m); while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; };
export function hashMensagem(texto) { const m = new TextEncoder().encode(texto); return keccak256(new Uint8Array([...new TextEncoder().encode(`\x19Ethereum Signed Message:\n${m.length}`), ...m])); }
export function recuperarEndereco(texto, assinaturaHex) {
  const h = assinaturaHex.replace(/^0x/, ''); if (!/^[0-9a-fA-F]{130}$/.test(h)) throw new Error('assinatura deve ter 65 bytes (130 hex)');
  const r = BigInt('0x' + h.slice(0, 64)), s = BigInt('0x' + h.slice(64, 128)); let v = parseInt(h.slice(128), 16); if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error('v invalido'); if (r <= 0n || r >= N || s <= 0n || s >= N) throw new Error('r/s fora do intervalo');
  const x = r, y2 = mod(x * x * x + 7n); let y = pow(y2, (P + 1n) / 4n, P); if (mod(y * y) !== y2) throw new Error('ponto invalido'); if ((y & 1n) !== BigInt(v)) y = P - y;
  const e = BigInt('0x' + hex(hashMensagem(texto))), ri = inv(r, N);
  const Q = mul(ri, add(mul(s, [x, y]), mul(mod(-e, N), G))); if (!Q) throw new Error('recuperacao falhou');
  const pub = new Uint8Array(64); for (let i = 0; i < 32; i++) { pub[i] = Number((Q[0] >> BigInt(8 * (31 - i))) & 0xffn); pub[32 + i] = Number((Q[1] >> BigInt(8 * (31 - i))) & 0xffn); }
  return '0x' + hex(keccak256(pub)).slice(24);
}
