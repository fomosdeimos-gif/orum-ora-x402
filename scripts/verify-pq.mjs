// Verifica a atestação pós-quântica (SLH-DSA-SHAKE-128s): o real tem de passar e cada mentira propositada tem de falhar.
// Sem rede, sem pagamentos. Assina uma única vez (cerca de 15 s) com uma chave efémera, para provar o caminho de produção.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { conferirCopia } from '../kit/pq.mjs';
import { assinar, verificar, conferirFicheiro, mensagem, chaveDaSemente, sementeDeHex, ficheiroDoCommit, ALGORITMO, CONTEXTO, TAMANHOS } from './lib/pq.mjs';
import { slh_dsa_shake_128s as SLH } from '../kit/pq/node_modules/@noble/post-quantum/slh-dsa.js';
import { sha256, sha3_256 } from './lib/raiz.mjs';

let mentiras = 0;
const falha = (nome, fn) => { assert.throws(fn, undefined, `estrago não apanhado: ${nome}`); mentiras++; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const hex = (u8) => Buffer.from(u8).toString('hex');
const enc = (s) => new TextEncoder().encode(s);
const gitLer = (commit, p) => execFileSync('git', ['show', `${commit}:${p}`], { maxBuffer: 64 * 1024 * 1024 });

// 1. A cópia da biblioteca é a registada (e qualquer alteração é apanhada)
const vendor = JSON.parse(fs.readFileSync('kit/pq/VENDOR.json'));
const lerCopia = (c) => fs.readFileSync(c);
assert.equal(conferirCopia(lerCopia, vendor), vendor.ficheiros.length);
assert.ok(vendor.ficheiros.some((f) => f.caminho.endsWith('slh-dsa.js')) && vendor.ficheiros.some((f) => f.caminho.endsWith('sha3.js')));
falha('ficheiro da biblioteca alterado', () => conferirCopia((c) => (c.endsWith('slh-dsa.js') ? Buffer.concat([lerCopia(c), Buffer.from('\n// x')]) : lerCopia(c)), vendor));
falha('ficheiro da biblioteca em falta', () => conferirCopia((c) => { if (c.endsWith('sha3.js')) throw new Error('em falta'); return lerCopia(c); }, vendor));
falha('hash da biblioteca mudado no registo', () => conferirCopia(lerCopia, { ficheiros: [{ ...vendor.ficheiros[0], sha256: '0'.repeat(64) }] }));

// 2. Parâmetros do algoritmo (FIPS 205, SHAKE-128s) e vetor cruzado com a implementação Python independente
assert.deepEqual(TAMANHOS, { semente: 48, chave_publica: 32, assinatura: 7856 });
assert.equal(ALGORITMO, 'SLH-DSA-SHAKE-128s');
const vet = JSON.parse(fs.readFileSync('kit/pq/vetor-cruzado.json'));
assert.equal(hex(chaveDaSemente(sementeDeHex(vet.semente_publica_de_teste)).publicKey), vet.chave_publica, 'a chave da semente pública mudou');
const pk = Uint8Array.from(Buffer.from(vet.chave_publica, 'hex'));
const sig = Uint8Array.from(Buffer.from(vet.assinatura, 'hex'));
assert.equal(sig.length, TAMANHOS.assinatura);
const msg = enc(vet.mensagem_utf8), ctx = enc(vet.contexto_utf8);
assert.equal(SLH.verify(sig, msg, pk, { context: ctx }), true, 'o vetor cruzado devia verificar');
const rejeita = (nome, ok) => { assert.equal(ok, false, `estrago não apanhado: ${nome}`); mentiras++; };
rejeita('vetor: mensagem alterada', SLH.verify(sig, enc('ORUM teste!'), pk, { context: ctx }));
rejeita('vetor: contexto errado', SLH.verify(sig, msg, pk, { context: enc('outro') }));
rejeita('vetor: sem contexto', SLH.verify(sig, msg, pk, { context: enc('') }));
{ const m = Uint8Array.from(sig); m[100] ^= 1; rejeita('vetor: 1 bit da assinatura', SLH.verify(m, msg, pk, { context: ctx })); }
{ const p = Uint8Array.from(pk); p[0] ^= 1; rejeita('vetor: chave pública alterada', SLH.verify(sig, msg, p, { context: ctx })); }
falha('vetor: assinatura truncada', () => SLH.verify(sig.subarray(0, 7000), msg, pk, { context: ctx }) || (() => { throw new Error('recusada'); })());
falha('semente com tamanho errado', () => chaveDaSemente(new Uint8Array(47)));
falha('semente hex errada', () => sementeDeHex('abc'));

// 3. Formato da mensagem (texto exacto que se assina)
const F = [{ caminho: 'b/c.txt', sha256: 'b'.repeat(64), sha3_256: 'c'.repeat(64) }, { caminho: 'a.txt', sha256: 'a'.repeat(64), sha3_256: 'd'.repeat(64) }];
const base = { tipo: 'teste', chave_publica: 'e'.repeat(64), commit_base: 'f'.repeat(40), ficheiros: F };
assert.equal(mensagem(base), `${CONTEXTO}\ntipo: teste\nalgoritmo: ${ALGORITMO}\nchave_publica: ${'e'.repeat(64)}\ncommit_base: ${'f'.repeat(40)}\na.txt\t${'a'.repeat(64)}\t${'d'.repeat(64)}\nb/c.txt\t${'b'.repeat(64)}\t${'c'.repeat(64)}\n`);
assert.equal(mensagem({ ...base, ficheiros: [...F].reverse() }), mensagem(base), 'a ordem da lista não pode mudar a mensagem');
falha('mensagem: tipo desconhecido', () => mensagem({ ...base, tipo: 'oficial' }));
falha('mensagem: chave pública curta', () => mensagem({ ...base, chave_publica: 'abc' }));
falha('mensagem: commit inválido', () => mensagem({ ...base, commit_base: 'main' }));
falha('mensagem: sem ficheiros', () => mensagem({ ...base, ficheiros: [] }));
falha('mensagem: caminho repetido', () => mensagem({ ...base, ficheiros: [F[0], F[0]] }));
falha('mensagem: caminho com ..', () => mensagem({ ...base, ficheiros: [{ ...F[0], caminho: '../x' }] }));
falha('mensagem: caminho absoluto', () => mensagem({ ...base, ficheiros: [{ ...F[0], caminho: '/etc/x' }] }));
falha('mensagem: hash inválido', () => mensagem({ ...base, ficheiros: [{ ...F[0], sha3_256: 'zz' }] }));

// 4. O exemplo de teste real, contra o commit real
const exemploBytes = fs.readFileSync('kit/pq/exemplo-teste.json');
const exemplo = JSON.parse(exemploBytes);
const r = verificar({ atestacaoBytes: exemploBytes, ler: gitLer });
assert.equal(r.tipo, 'teste'); assert.equal(r.autoridade, false);
assert.ok(/EXEMPLO DE TESTE/.test(exemplo.proposito) && /descartada/.test(exemplo.proposito));
assert.ok(!/semente|ORUM_PQ_SEED|secret/i.test(exemploBytes.toString().replace(/Nunca|nunca/g, '')), 'o exemplo não pode trazer segredos');

// 5. Mentiras sobre a atestação (em memória, sem git)
const commit = exemplo.commit_base;
const conteudo = Object.fromEntries(exemplo.ficheiros.map((f) => [f.caminho, gitLer(commit, f.caminho)]));
const lerMem = (c, p) => { if (!(p in conteudo)) throw new Error('em falta'); return conteudo[p]; };
const corre = (a, { ler = lerMem, registo = null } = {}) => verificar({ atestacaoBytes: Buffer.from(JSON.stringify(a)), ler, registo });
const com = (mut) => { const a = clone(exemplo); mut(a); return a; };
assert.equal(corre(exemplo).ficheiros, 3, 'o exemplo devia passar em memória');

falha('ficheiro alterado no commit', () => corre(exemplo, { ler: (c, p) => (p === exemplo.ficheiros[0].caminho ? Buffer.from('mentira') : lerMem(c, p)) }));
falha('ficheiro em falta no commit', () => corre(exemplo, { ler: (c, p) => { if (p === exemplo.ficheiros[1].caminho) throw new Error('em falta'); return lerMem(c, p); } }));
falha('sha256 mudado', () => corre(com((a) => { a.ficheiros[0].sha256 = '0'.repeat(64); })));
falha('sha3-256 mudado', () => corre(com((a) => { a.ficheiros[0].sha3_256 = '0'.repeat(64); })));
falha('ficheiro retirado da lista (só a assinatura o denuncia)', () => corre(com((a) => { a.ficheiros.pop(); })));
falha('ficheiro acrescentado, com hashes certos (só a assinatura o denuncia)', () => corre(com((a) => { a.ficheiros.push({ caminho: 'ancora/raiz-registos.json', sha256: sha256(conteudo[exemplo.ficheiros[0].caminho]), sha3_256: exemplo.ficheiros[0].sha3_256 }); })));
falha('teste passado por produção (o tipo entra na mensagem)', () => corre(com((a) => { a.tipo = 'producao'; }), { registo: { chaves: [{ chave_publica: exemplo.chave_publica, estado: 'activa' }] } }));
falha('chave pública trocada', () => corre(com((a) => { a.chave_publica = hex(chaveDaSemente(new Uint8Array(48).fill(7)).publicKey); })));
falha('commit trocado (a mensagem muda)', () => corre(com((a) => { a.commit_base = 'a'.repeat(40); })));
falha('1 bit da assinatura', () => corre(com((a) => { const b = Buffer.from(a.assinatura, 'hex'); b[200] ^= 1; a.assinatura = b.toString('hex'); })));
falha('assinatura truncada', () => corre(com((a) => { a.assinatura = a.assinatura.slice(0, 2000); })));
falha('assinatura com tamanho a mais', () => corre(com((a) => { a.assinatura += '00'; })));
falha('assinatura não hex', () => corre(com((a) => { a.assinatura = 'x'.repeat(7856 * 2); })));
falha('algoritmo noutro nome', () => corre(com((a) => { a.algoritmo = 'ML-DSA-65'; })));
falha('contexto trocado', () => corre(com((a) => { a.contexto = 'outro'; })));
falha('schema desconhecido', () => corre(com((a) => { a.schema = 'outro'; })));
falha('tipo desconhecido', () => corre(com((a) => { a.tipo = 'oficial'; })));
falha('sem a fronteira "não prova"', () => corre(com((a) => { a.prova = 'Prova valor.'; })));
falha('mensagem_sha256 mudada', () => corre(com((a) => { a.mensagem_sha256 = '1'.repeat(64); })));

// Cada hash isolado: só um dos dois errado (o outro certo) tem de bastar para recusar o ficheiro
{
  const bytes = Buffer.from('conteúdo'); const certo = { caminho: 'x', sha256: sha256(bytes), sha3_256: sha3_256(bytes) };
  conferirFicheiro(certo, bytes);
  falha('só o sha256 errado', () => conferirFicheiro({ ...certo, sha256: '0'.repeat(64) }, bytes));
  falha('só o sha3-256 errado', () => conferirFicheiro({ ...certo, sha3_256: '0'.repeat(64) }, bytes));
  falha('bytes trocados, hashes antigos', () => conferirFicheiro(certo, Buffer.from('outro')));
}

// 6. Registo de chaves: produção só com chave activa; teste nunca com chave do registo
const registoDoExemplo = { chaves: [{ chave_publica: exemplo.chave_publica, estado: 'activa' }] };
falha('teste com uma chave do registo', () => corre(exemplo, { registo: registoDoExemplo }));
const sementeProd = new Uint8Array(48).map((_, i) => 255 - i); // chave efémera de teste deste verificador, não é do organismo
const prod = assinar({ semente: sementeProd, tipo: 'producao', commit_base: commit, ficheiros: exemplo.ficheiros });
prod.prova = exemplo.prova;
const pkProd = prod.chave_publica;
const regActivo = { chaves: [{ chave_publica: pkProd, estado: 'activa' }] };
const ok = corre(prod, { registo: regActivo });
assert.equal(ok.autoridade, true); assert.equal(ok.tipo, 'producao');
falha('produção sem registo', () => corre(prod));
falha('produção com o registo vazio', () => corre(prod, { registo: { chaves: [] } }));
falha('produção com chave revogada', () => corre(prod, { registo: { chaves: [{ chave_publica: pkProd, estado: 'revogada' }] } }));
falha('produção com outra chave no registo', () => corre(prod, { registo: { chaves: [{ chave_publica: exemplo.chave_publica, estado: 'activa' }] } }));
falha('produção com a assinatura de outra mensagem', () => corre({ ...prod, assinatura: exemplo.assinatura }, { registo: regActivo }));

console.log(JSON.stringify({ verified: true, biblioteca_ficheiros: vendor.ficheiros.length, algoritmo: ALGORITMO, assinatura_bytes: TAMANHOS.assinatura, exemplo: { tipo: r.tipo, autoridade: r.autoridade, ficheiros: r.ficheiros }, casos_de_mentira: mentiras }));
