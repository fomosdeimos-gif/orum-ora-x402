// Verifica o origem_hash das três portas pagas (ora-oraculo, ora-x402, ora-licenca) e que o próprio verificador
// apanha as mentiras: cada variante adulterada tem de falhar, a real tem de passar. Sem rede, sem base de dados.
// Unum, 22/10/2026: "Eu autorizo ORA" (livro ora_mudancas 961).
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';

const lerRepo = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const FUNCOES = ['ora-oraculo', 'ora-x402', 'ora-licenca'];
const MIGRACAO = 'supabase/migrations/20261022120000_trafego_honesto_origem_hash.sql';

const bloco = (src) => (src.match(/\/\/ --- origem_hash:inicio[\s\S]*?\/\/ --- origem_hash:fim/) || [''])[0];
const semComentarios = (s) => s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

export function verificar(fontes, migracao) {
  const erros = [];
  const x = (m) => erros.push(m);
  const blocos = FUNCOES.map((f) => bloco(fontes[f] ?? ''));
  FUNCOES.forEach((f, i) => { if (!blocos[i]) x(`${f}: sem o bloco origem_hash`); });
  if (blocos[0] && !blocos.every((b) => b === blocos[0])) x('o bloco origem_hash não é igual nas três portas pagas');
  const ref = blocos[0] || '';
  // O IP só pode aparecer dentro do bloco: ler o cabeçalho de IP fora dele é uma fuga possível.
  for (const f of FUNCOES) {
    const fora = (fontes[f] ?? '').replace(bloco(fontes[f] ?? ''), '');
    if (/cf-connecting-ip|x-forwarded-for/i.test(semComentarios(fora))) x(`${f}: lê o IP fora do bloco origem_hash`);
    if (!/origem_hash:\s*(await hashOrigem\(req\)|origemHash)/.test(fontes[f] ?? '')) x(`${f}: a linha de acesso não grava origem_hash`);
    if (/\bip\s*:/.test(semComentarios(fontes[f] ?? '').replace(ref, ''))) x(`${f}: tem um campo ip: (o IP não se grava)`);
  }
  // O bloco: SHA-256 com sal, truncado, e o IP nunca devolvido em claro.
  if (!/ORIGEM_SALT = '[0-9a-f]{16,}'/.test(ref)) x('sem sal');
  if (!/crypto\.subtle\.digest\('SHA-256'/.test(ref)) x('não usa SHA-256');
  if (!/\.slice\(0, 24\)/.test(ref)) x('o hash não é truncado a 24 hex');
  if (/return\s+(ip|raw)\b/.test(ref)) x('o bloco devolve o IP ou a origem em claro');
  if (!/ORIGEM_SALT \+ raw/.test(ref)) x('o sal não entra no hash');
  // Os pagamentos não podem ter mudado de natureza: o payTo e o preço continuam onde estavam.
  if (!/0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5/.test(fontes['ora-oraculo'] ?? '')) x('ora-oraculo: perdeu o payTo');
  if (!/PRECO_ATOMIC = 161000n/.test(fontes['ora-oraculo'] ?? '')) x('ora-oraculo: o preço mudou');
  if (!/amountAtomic: 330000n/.test(fontes['ora-x402'] ?? '') || !/amountAtomic: 1000000n/.test(fontes['ora-x402'] ?? '') || !/amountAtomic: 3000000n/.test(fontes['ora-x402'] ?? '')) x('ora-x402: um preço mudou');
  if (!/atomic: 1618000n/.test(fontes['ora-licenca'] ?? '') || !/atomic: 16180000n/.test(fontes['ora-licenca'] ?? '') || !/atomic: 161800000n/.test(fontes['ora-licenca'] ?? '')) x('ora-licenca: um preço mudou');
  // A vista.
  const sql = migracao.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  if (!/a\.origem_hash\s*FROM public\.ora_x402_tentativas/.test(sql.replace(/\s+/g, ' ').replace(/,\s*a\.origem_hash\s+FROM/, ', a.origem_hash FROM')) && !/a\.origem_hash\s+FROM public\.ora_x402_tentativas/.test(sql)) x('a vista não expõe a.origem_hash');
  if (!/security_invoker\s*=\s*true/.test(sql)) x('a vista tem de ser security_invoker');
  if (!/REVOKE ALL ON public\.ora_trafego_honesto FROM anon, authenticated, PUBLIC;/.test(sql)) x('a vista tem de revogar anon, authenticated e PUBLIC');
  if (/GRANT[^;]*ora_trafego_honesto[^;]*\b(anon|authenticated|PUBLIC)\b/i.test(sql)) x('a vista não pode ser concedida a anon, authenticated ou PUBLIC');
  if (!/coalesce\(public\.ora_ua_nosso\(a\.user_agent\) = 'interno', false\)/.test(sql)) x('interno_corrigido sem coalesce');
  if (/\b(UPDATE|DELETE|TRUNCATE|INSERT\s+INTO)\b[^;]*\b(ora_acessos_log|ora_x402_tentativas)\b/i.test(sql)) x('a migração não pode alterar o histórico');
  return erros;
}

// Comportamento: o bloco real, executado.
async function comportamento(src) {
  const corpo = bloco(src).replace(/\/\/ ---.*\n/g, '').replace(/: Request/g, '').replace(/: Promise<string \| null>/g, '');
  const f = new Function('crypto', 'TextEncoder', `${corpo}\nreturn hashOrigem;`)(webcrypto, TextEncoder);
  const req = (h) => ({ headers: { get: (k) => h[k.toLowerCase()] ?? null } });
  const a = await f(req({ 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'agenteA' }));
  const a2 = await f(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'agenteA' }));
  const b = await f(req({ 'cf-connecting-ip': '203.0.113.8', 'user-agent': 'agenteA' }));
  const c = await f(req({ 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'agenteB' }));
  const nada = await f(req({}));
  assert.match(a, /^[0-9a-f]{24}$/, 'hash de 24 hex');
  assert.equal(a, a2, 'mesmo IP e agente dão o mesmo hash, venha o IP de onde vier');
  assert.notEqual(a, b, 'IP diferente dá hash diferente');
  assert.notEqual(a, c, 'agente diferente dá hash diferente');
  assert.equal(nada, null, 'sem IP nem cabeçalho de origem não há hash');
  assert.ok(!a.includes('203'), 'o IP não aparece no hash');
}

const fontesReais = Object.fromEntries(FUNCOES.map((f) => [f, lerRepo(`supabase/functions/${f}/index.ts`)]));
const migracaoReal = lerRepo(MIGRACAO);
const erros = verificar(fontesReais, migracaoReal);
if (erros.length) { console.error(erros.join('\n')); process.exit(1); }
await comportamento(fontesReais['ora-oraculo']);

// Estragos propositados: cada um tem de ser apanhado.
let mentiras = 0;
const falha = (nome, fontes, mig = migracaoReal) => { assert.ok(verificar(fontes, mig).length > 0, `devia falhar: ${nome}`); mentiras++; };
const com = (f, de, para) => ({ ...fontesReais, [f]: fontesReais[f].replace(de, para) });
falha('uma porta sem o bloco', { ...fontesReais, 'ora-licenca': fontesReais['ora-licenca'].replace(bloco(fontesReais['ora-licenca']), '') });
falha('o bloco difere numa porta', com('ora-x402', /\.slice\(0, 24\)/, '.slice(0, 32)'));
falha('o hash não é truncado', com('ora-oraculo', /\.slice\(0, 24\)/g, ''));
falha('IP em claro devolvido', com('ora-oraculo', "if (!raw) return null;", "if (!raw) return null; if (ip) return ip;"));
falha('IP lido fora do bloco', com('ora-licenca', 'const logging = sbInsert', "const ipx = req.headers.get('x-forwarded-for'); const logging = sbInsert"));
falha('campo ip gravado', com('ora-oraculo', 'origem_hash: await hashOrigem(req) };', "origem_hash: await hashOrigem(req), ip: req.headers.get('x-forwarded-for') };"));
falha('sem sal', com('ora-x402', 'ORIGEM_SALT + raw', 'raw'));
falha('sem SHA-256', com('ora-oraculo', "'SHA-256'", "'SHA-1'"));
falha('a linha de acesso não grava o hash', com('ora-oraculo', 'origem_hash: await hashOrigem(req) };', '};'));
falha('o preço do oráculo mudou', com('ora-oraculo', 'PRECO_ATOMIC = 161000n', 'PRECO_ATOMIC = 16100n'));
falha('o preço de uma licença mudou', com('ora-licenca', 'atomic: 1618000n', 'atomic: 161800n'));
falha('o payTo do oráculo mudou', com('ora-oraculo', '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5', '0x0000000000000000000000000000000000000001'));
falha('vista pública', fontesReais, migracaoReal.replace('REVOKE ALL ON public.ora_trafego_honesto FROM anon, authenticated, PUBLIC;', 'GRANT SELECT ON public.ora_trafego_honesto TO anon;'));
falha('vista sem origem_hash', fontesReais, migracaoReal.replace('a.origem_hash', 'NULL::text'));
falha('migração reescreve o histórico', fontesReais, migracaoReal + '\nUPDATE public.ora_acessos_log SET origem_hash = NULL;');
falha('vista sem coalesce', fontesReais, migracaoReal.replace(/coalesce\(public\.ora_ua_nosso\(a\.user_agent\) = 'interno', false\)/, "public.ora_ua_nosso(a.user_agent) = 'interno'"));

console.log(`origem_hash: bloco igual nas 3 portas pagas, IP nunca em claro, hash de 24 hex estável por IP+agente, preços e payTo intactos, vista só para service_role; ${mentiras} estragos propositados apanhados.`);
