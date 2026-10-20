// Atestação pós-quântica (SLH-DSA-SHAKE-128s, FIPS 205): uma assinatura sem curvas elípticas, que assenta só em hashes.
// Código da biblioteca: kit/pq/node_modules/@noble (cópia byte a byte de @noble/post-quantum 0.7.1, ver kit/pq/VENDOR.json).
// Módulo sem rede. Assinar usa uma semente que vem de fora (nunca se guarda aqui).
import crypto from 'node:crypto';
import { slh_dsa_shake_128s as SLH } from '../../kit/pq/node_modules/@noble/post-quantum/slh-dsa.js';
import { sha256, sha3_256 } from './raiz.mjs';

export const SCHEMA = 'orum-pq-atestacao/v1';
export const ALGORITMO = 'SLH-DSA-SHAKE-128s';
export const CONTEXTO = 'ORUM-ATESTACAO-PQ/v1';
export const TIPOS = ['teste', 'producao'];
export const TAMANHOS = { semente: SLH.lengths.seed, chave_publica: SLH.lengths.publicKey, assinatura: SLH.lengths.signature };
const HEX = (n) => new RegExp(`^[0-9a-f]{${n * 2}}$`);
const enc = (s) => new TextEncoder().encode(s);
const hex = (u8) => Buffer.from(u8).toString('hex');
const bytes = (h) => Uint8Array.from(Buffer.from(h, 'hex'));

// Texto exacto que se assina (o tipo e a chave entram nele: uma atestação de teste não se passa por de produção).
export function mensagem({ tipo, chave_publica, commit_base, ficheiros }) {
  if (!TIPOS.includes(tipo)) throw new Error('tipo desconhecido');
  if (!HEX(TAMANHOS.chave_publica).test(chave_publica ?? '')) throw new Error('chave pública inválida');
  if (!/^[0-9a-f]{40}$/.test(commit_base ?? '')) throw new Error('commit_base inválido');
  if (!Array.isArray(ficheiros) || !ficheiros.length) throw new Error('sem ficheiros');
  const ordenada = [...ficheiros].sort((a, b) => Buffer.compare(Buffer.from(a.caminho), Buffer.from(b.caminho)));
  if (new Set(ordenada.map((f) => f.caminho)).size !== ordenada.length) throw new Error('caminho repetido');
  for (const f of ordenada) {
    if (!/^[A-Za-z0-9._\/-]+$/.test(f.caminho) || f.caminho.startsWith('/') || f.caminho.includes('..')) throw new Error(`caminho inválido: ${f.caminho}`);
    if (!HEX(32).test(f.sha256 ?? '') || !HEX(32).test(f.sha3_256 ?? '')) throw new Error(`hash inválido: ${f.caminho}`);
  }
  return [CONTEXTO, `tipo: ${tipo}`, `algoritmo: ${ALGORITMO}`, `chave_publica: ${chave_publica}`, `commit_base: ${commit_base}`,
    ...ordenada.map((f) => `${f.caminho}\t${f.sha256}\t${f.sha3_256}`)].join('\n') + '\n';
}

export const chaveDaSemente = (semente) => {
  if (!(semente instanceof Uint8Array) || semente.length !== TAMANHOS.semente) throw new Error(`a semente tem de ter ${TAMANHOS.semente} bytes`);
  return SLH.keygen(semente);
};
export const sementeAleatoria = () => Uint8Array.from(crypto.randomBytes(TAMANHOS.semente));
export const sementeDeHex = (h) => {
  if (!HEX(TAMANHOS.semente).test(h ?? '')) throw new Error(`a semente tem de ser ${TAMANHOS.semente * 2} hex`);
  return bytes(h);
};

// Entrada de ficheiro lida de um commit: ler(commit, caminho) devolve os bytes.
export const ficheiroDoCommit = (ler, commit, caminho) => {
  const b = ler(commit, caminho);
  return { caminho, sha256: sha256(b), sha3_256: sha3_256(b) };
};

// Assina de forma determinista (sem aleatoriedade extra): a mesma semente e a mesma mensagem dão sempre a mesma assinatura.
export function assinar({ semente, tipo, commit_base, ficheiros }) {
  const kp = chaveDaSemente(semente);
  const chave_publica = hex(kp.publicKey);
  const msg = mensagem({ tipo, chave_publica, commit_base, ficheiros });
  const assinatura = SLH.sign(enc(msg), kp.secretKey, { context: enc(CONTEXTO), extraEntropy: false });
  return {
    schema: SCHEMA, tipo, algoritmo: ALGORITMO, contexto: CONTEXTO, chave_publica, commit_base, ficheiros,
    mensagem_sha256: sha256(Buffer.from(msg)), assinatura: hex(assinatura),
  };
}

// Os DOIS hashes têm de bater: se um dia um deles for quebrado, o outro ainda denuncia o ficheiro trocado.
export function conferirFicheiro(f, bytes) {
  if (sha256(bytes) !== f.sha256) throw new Error(`${f.caminho} não tem o sha256 dito`);
  if (sha3_256(bytes) !== f.sha3_256) throw new Error(`${f.caminho} não tem o sha3-256 dito`);
}

// Confere uma atestação. registo = { chaves: [{ chave_publica, estado }] } (as chaves de produção admitidas), ou null.
export function verificar({ atestacaoBytes, ler, registo = null }) {
  const a = JSON.parse(atestacaoBytes);
  if (a.schema !== SCHEMA) throw new Error('schema desconhecido');
  if (a.algoritmo !== ALGORITMO) throw new Error(`algoritmo não admitido: ${a.algoritmo}`);
  if (a.contexto !== CONTEXTO) throw new Error('contexto desconhecido');
  if (!TIPOS.includes(a.tipo)) throw new Error('tipo desconhecido');
  if (!/Não prova autoria, valor, procura nem receita/.test(a.prova ?? '')) throw new Error('a atestação perdeu a fronteira "não prova"');
  for (const f of a.ficheiros ?? []) conferirFicheiro(f, ler(a.commit_base, f.caminho));
  const msg = mensagem(a);
  if (sha256(Buffer.from(msg)) !== a.mensagem_sha256) throw new Error('mensagem_sha256 não bate com a mensagem');
  if (!SLH.verify(bytes(a.assinatura), enc(msg), bytes(a.chave_publica), { context: enc(CONTEXTO) })) throw new Error('assinatura inválida');
  const admitida = (registo?.chaves ?? []).some((k) => k.chave_publica === a.chave_publica && k.estado === 'activa');
  if (a.tipo === 'producao' && !admitida) throw new Error('atestação de produção com uma chave que não está activa no registo');
  if (a.tipo === 'teste' && (registo?.chaves ?? []).some((k) => k.chave_publica === a.chave_publica)) throw new Error('atestação de teste com uma chave do registo');
  return { tipo: a.tipo, autoridade: a.tipo === 'producao', chave_publica: a.chave_publica, ficheiros: a.ficheiros.length, commit_base: a.commit_base, texto: msg };
}
