// Verifica supabase/implantado.json (o que está implantado no Supabase) contra o disco do repositório e que o
// próprio verificador apanha as mentiras: cada variante adulterada tem de falhar, a real tem de passar.
// Sem rede. Não consegue ver o Supabase vivo: a conferência com o vivo é list_edge_functions (ver como_conferir).
// Unum, 22/10/2026: "Eu autorizo ORA, começa pelo 1 e 2" (livro ora_mudancas 946).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const raiz = new URL('../', import.meta.url);
const real = JSON.parse(readFileSync(new URL('supabase/implantado.json', raiz), 'utf8'));
const ESTADOS = ['igual', 'diverge', 'nao_comparado', 'sem_copia'];

const fsReal = {
  existe: (slug) => existsSync(new URL(`supabase/functions/${slug}/index.ts`, raiz)),
  sha: (slug) => createHash('sha256').update(readFileSync(new URL(`supabase/functions/${slug}/index.ts`, raiz))).digest('hex'),
  // Pasta com vários ficheiros (contraparte): sha256 de "nome\0sha256(ficheiro)\n" por ficheiro, por ordem de nome.
  shaPasta: (dir) => createHash('sha256').update(readdirSync(new URL(`supabase/functions/${dir}/`, raiz)).sort().map((n) => `${n}\0${createHash('sha256').update(readFileSync(new URL(`supabase/functions/${dir}/${n}`, raiz))).digest('hex')}\n`).join('')).digest('hex'),
  pastas: () => readdirSync(new URL('supabase/functions/', raiz)).filter((d) => statSync(new URL(`supabase/functions/${d}`, raiz)).isDirectory()).sort(),
};

export function verificar(reg, fs) {
  const erros = [];
  const x = (m) => erros.push(m);
  if (reg?.format !== 'orum-implantado/v1') x('formato desconhecido');
  if (!Array.isArray(reg?.funcoes) || reg.funcoes.length === 0) { x('sem funcoes'); return erros; }
  if (!reg.lido_em_utc || !reg.fonte || !reg.como_conferir || !Array.isArray(reg.limites) || reg.limites.length === 0) x('faltam lido_em_utc, fonte, como_conferir ou limites');
  const vistos = new Set();
  for (const f of reg.funcoes) {
    const id = f?.slug ?? '(sem slug)';
    const e = (m) => x(`${id}: ${m}`);
    if (!f?.slug) { e('sem slug'); continue; }
    if (vistos.has(f.slug)) e('slug repetido'); vistos.add(f.slug);
    if (!Number.isInteger(f.versao) || f.versao < 1) e('versao inválida');
    if (typeof f.verify_jwt !== 'boolean') e('verify_jwt inválido');
    if (!/^[0-9a-f]{16}$/.test(f.ezbr_sha256_16 ?? '')) e('impressão não é hex de 16');
    if (Number.isNaN(Date.parse(f.atualizada_em ?? ''))) e('atualizada_em inválida');
    const r = f.reconciliacao ?? {};
    const viaContraparte = !fs.existe(f.slug) && r.estado === 'igual' && Boolean(r.contraparte_no_repositorio) && fs.pastas().includes(r.contraparte_no_repositorio);
    const existe = fs.existe(f.slug) || viaContraparte;
    if (f.repo !== existe) e(`repo=${f.repo} mas a cópia ${existe ? 'existe' : 'não existe'} no disco`);
    if (!ESTADOS.includes(r.estado)) { e(`estado desconhecido (${r.estado})`); continue; }
    if (r.estado === 'sem_copia' && existe) e('sem_copia mas há cópia no repositório');
    if (r.estado !== 'sem_copia' && !existe) e(`${r.estado} sem cópia no repositório`);
    if (r.contraparte_no_repositorio && !fs.pastas().includes(r.contraparte_no_repositorio)) e('contraparte não existe no repositório');
    if (r.estado === 'diverge' && !(r.nota && r.nota.length > 20)) e('diverge sem a prova escrita');
    if (r.estado === 'igual') {
      if (r.versao_conferida !== f.versao) e(`igual foi conferido na v${r.versao_conferida} mas está implantada a v${f.versao}: reconciliar outra vez`);
      if (!/^[0-9a-f]{64}$/.test(r.fonte_sha256 ?? '')) e('igual sem fonte_sha256');
      else if (existe && r.fonte_sha256 !== (viaContraparte ? fs.shaPasta(r.contraparte_no_repositorio) : fs.sha(f.slug))) e('o ficheiro do repositório mudou desde a conferência (sha256 diferente): reconciliar outra vez');
    }
    if (f.toca_dinheiro !== null && !(f.toca_dinheiro?.evidencia)) e('toca_dinheiro sem evidência');
    if (!f.uso_24h || !Number.isInteger(f.uso_24h.pedidos) || f.uso_24h.pedidos < 0) e('uso_24h inválido');
  }
  // O resumo e as dívidas derivam-se, não se escrevem à vontade.
  const n = (p) => reg.funcoes.filter(p).length;
  const esperado = {
    total: reg.funcoes.length, com_copia_no_repositorio: n((f) => f.repo), sem_copia_no_repositorio: n((f) => !f.repo),
    igual: n((f) => f.reconciliacao?.estado === 'igual'), diverge: n((f) => f.reconciliacao?.estado === 'diverge'),
    nao_comparado: n((f) => f.reconciliacao?.estado === 'nao_comparado'), sem_copia: n((f) => f.reconciliacao?.estado === 'sem_copia'),
    dividas_que_tocam_dinheiro: reg.funcoes.filter((f) => f.toca_dinheiro && f.reconciliacao?.estado !== 'igual').map((f) => f.slug).sort(),
  };
  for (const [k, v] of Object.entries(esperado)) {
    if (JSON.stringify(reg.resumo?.[k]) !== JSON.stringify(v)) x(`resumo.${k} diz ${JSON.stringify(reg.resumo?.[k])} mas o cálculo dá ${JSON.stringify(v)}`);
  }
  // Pastas do repositório sem função implantada têm de estar ditas, nem mais nem menos.
  const contrapartes = new Set(reg.funcoes.filter((f) => f.reconciliacao?.estado === 'igual' && f.reconciliacao.contraparte_no_repositorio).map((f) => f.reconciliacao.contraparte_no_repositorio));
  const soRepo = fs.pastas().filter((d) => !vistos.has(d) && !contrapartes.has(d));
  if (JSON.stringify([...(reg.so_no_repositorio ?? [])].sort()) !== JSON.stringify(soRepo)) x(`so_no_repositorio diz ${JSON.stringify(reg.so_no_repositorio)} mas no disco são ${JSON.stringify(soRepo)}`);
  return erros;
}

assert.deepEqual(verificar(real, fsReal), [], 'o registo real devia passar: ' + verificar(real, fsReal).join('; '));

const clone = () => JSON.parse(JSON.stringify(real));
const get = (r, slug) => r.funcoes.find((f) => f.slug === slug);
let mentiras = 0;
const falha = (nome, reg, fs = fsReal) => { assert.ok(verificar(reg, fs).length > 0, `devia falhar: ${nome}`); mentiras++; };

{ const r = clone(); get(r, 'ora-oraculo').repo = false; falha('diz que não há cópia quando há', r); }
{ const r = clone(); get(r, 'ora-x402').repo = true; get(r, 'pensamento').repo = true; falha('diz que há cópia quando não há', r); }
{ const r = clone(); get(r, 'ora-cdp-teste-oraculo').reconciliacao = { estado: 'igual', versao_conferida: 3, fonte_sha256: 'a'.repeat(64) }; falha('promove a igual sem prova (sha errado)', r); }
{ const r = clone(); get(r, 'ora-cdp-agente-teste').versao = 3; falha('igual com a versão implantada mudada', r); }
{ const r = clone(); get(r, 'ora-cdp-agente-teste').reconciliacao.fonte_sha256 = 'b'.repeat(64); falha('sha da conferência adulterado', r); }
{ const fs = { ...fsReal, sha: (s) => (s === 'ora-cdp-agente-teste' ? 'c'.repeat(64) : fsReal.sha(s)) }; falha('ficheiro do repositório mudou depois de conferir', clone(), fs); }
{ const r = clone(); get(r, 'ora-cdp-teste-oraculo').reconciliacao = { estado: 'diverge', nota: 'x' }; falha('diverge sem prova escrita', r); }
{ const r = clone(); get(r, 'pensamento').reconciliacao = { estado: 'nao_comparado' }; falha('nao_comparado sem cópia', r); }
{ const r = clone(); get(r, 'ora-licenca').reconciliacao = { estado: 'sem_copia' }; falha('sem_copia com cópia no repositório', r); }
{ const r = clone(); get(r, 'ora-nft-dedicar').toca_dinheiro = { evidencia: 'x' }; falha('esconde uma dívida que toca dinheiro (sem a declarar no resumo)', r); }
{ const r = clone(); r.resumo.igual += 1; falha('resumo inflacionado', r); }
{ const r = clone(); r.so_no_repositorio = []; falha('esconde pastas só no repositório', r); }
{ const r = clone(); r.funcoes.push({ ...get(r, 'pensamento') }); falha('slug repetido', r); }
{ const r = clone(); get(r, 'ora-licenca').toca_dinheiro = { evidencia: '' }; falha('toca_dinheiro sem evidência', r); }
{ const r = clone(); get(r, 'pensamento').ezbr_sha256_16 = 'xyz'; falha('impressão inválida', r); }
{ const r = clone(); get(r, 'ora-cdp-carteira-real').reconciliacao.contraparte_no_repositorio = 'nao-existe'; falha('contraparte inexistente', r); }
{ const fs = { ...fsReal, shaPasta: (d) => (d === 'ora-operational-wallet' ? 'd'.repeat(64) : fsReal.shaPasta(d)) }; falha('ficheiro da contraparte mudou depois de conferir', clone(), fs); }
{ const r = clone(); get(r, 'ora-cdp-carteira-real').versao = 15; falha('contraparte igual com a versão implantada mudada', r); }
{ const r = clone(); get(r, 'ora-cdp-carteira-real').reconciliacao.contraparte_no_repositorio = 'nao-existe'; get(r, 'ora-cdp-carteira-real').reconciliacao.estado = 'igual'; falha('igual com contraparte inexistente', r); }
{ const r = clone(); delete r.como_conferir; falha('sem como conferir', r); }

console.log(JSON.stringify({ verified: true, funcoes: real.funcoes.length, ...real.resumo, dividas: real.resumo.dividas_que_tocam_dinheiro.length, casos_de_mentira: mentiras }));
