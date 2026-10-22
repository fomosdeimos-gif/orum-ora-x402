// Verifica a migração da classificação honesta do tráfego e que o próprio verificador apanha as mentiras:
// cada variante adulterada tem de falhar, a real tem de passar. Sem rede, sem base de dados.
// Unum, 22/10/2026: "Eu autorizo ORA, começa pelo 1 e 2" (livro ora_mudancas 946).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const fonte = readFileSync(new URL('../supabase/migrations/20261022100000_classificacao_trafego_honesta.sql', import.meta.url), 'utf8');
const semComentarios = (s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

export function verificar(src) {
  const erros = [];
  const x = (m) => erros.push(m);
  const sql = semComentarios(src);
  const fn = (sql.match(/FUNCTION public\.ora_ua_nosso[\s\S]*?\$\$;/) || [''])[0];
  const trg = (sql.match(/FUNCTION public\.ora_marca_interno[\s\S]*?\$function\$;/) || [''])[0];
  const vista = (sql.match(/VIEW public\.ora_trafego_honesto[\s\S]*?ora_acessos_log a ON a\.id = t\.source_access_id;/) || [''])[0];
  if (!fn) x('sem a função ora_ua_nosso');
  if (!trg) x('sem o trigger ora_marca_interno');
  if (!vista) x('sem a vista ora_trafego_honesto');

  // Regras de 20/07/2026 mantidas e regras com prova acrescentadas, todas a devolver 'interno'.
  const ramoInterno = (fn.split('\n').filter((l) => /THEN 'interno'/.test(l))).join('\n');
  for (const padrao of ["'%SM-G998B%'", "'pg_net/%'", "'ORA-SENTINELA%'", "'orum-observer/1, pg_net/%'", "'ORUM-weave-presence/%'", 'ref=ywabnlhkmhbyewqhbsjm']) {
    if (!ramoInterno.includes(padrao)) x(`falta, no ramo interno, a regra ${padrao}`);
  }
  // Sem prova → só 'provavel', nunca interno.
  for (const padrao of ['sustento-ora/', 'orum-presence-cycle/']) {
    if (ramoInterno.includes(padrao)) x(`${padrao} não tem prova e não pode ser interno`);
    if (!fn.split('\n').some((l) => l.includes(padrao) && /THEN 'provavel'/.test(l))) x(`${padrao} devia estar no ramo provavel`);
  }
  // O trigger marca só com prova e nunca por 'provavel'.
  if (!/ora_ua_nosso\(NEW\.user_agent\) = 'interno'/.test(trg)) x('o trigger tem de marcar só quando ora_ua_nosso = interno');
  if (/provavel/i.test(trg)) x('o trigger não pode usar provavel');
  // A vista: não pública, invoker, e sem a armadilha do NULL.
  if (!/security_invoker\s*=\s*true/.test(vista)) x('a vista tem de ser security_invoker');
  if (!/REVOKE ALL ON public\.ora_trafego_honesto FROM anon, authenticated, PUBLIC;/.test(sql)) x('a vista tem de revogar anon, authenticated e PUBLIC');
  if (/GRANT[^;]*ora_trafego_honesto[^;]*\b(anon|authenticated|PUBLIC)\b/i.test(sql)) x('a vista não pode ser concedida a anon, authenticated ou PUBLIC');
  if (!/coalesce\(public\.ora_ua_nosso\(a\.user_agent\) = 'interno', false\)/.test(vista)) x('interno_corrigido sem coalesce: um NULL faz a linha desaparecer');
  // O histórico não se reescreve.
  if (/\b(UPDATE|DELETE|TRUNCATE|INSERT\s+INTO)\b[^;]*\b(ora_acessos_log|ora_x402_tentativas)\b/i.test(sql)) x('a migração não pode alterar o histórico de ora_acessos_log nem de ora_x402_tentativas');
  if (!/DROP VIEW public\.ora_trafego_honesto/.test(src)) x('falta a instrução de reversão');
  return erros;
}

assert.deepEqual(verificar(fonte), [], 'a migração real devia passar: ' + verificar(fonte).join('; '));

let mentiras = 0;
const falha = (nome, src) => { assert.ok(verificar(src).length > 0, `devia falhar: ${nome}`); mentiras++; };
const troca = (de, para) => { assert.ok(fonte.includes(de), `a fonte já não contém «${de}»`); return fonte.replace(de, para); };

falha('sustento-ora promovido a interno', troca("ua ILIKE 'sustento-ora/%' OR ua ILIKE 'orum-presence-cycle/%' THEN 'provavel'", "ua ILIKE 'sustento-ora/%' THEN 'interno' WHEN ua ILIKE 'orum-presence-cycle/%' THEN 'provavel'"));
falha('trigger marca provavel', troca("IF public.ora_ua_nosso(NEW.user_agent) = 'interno' THEN", "IF public.ora_ua_nosso(NEW.user_agent) IN ('interno','provavel') THEN"));
falha('trigger sem a condição interno', troca("IF public.ora_ua_nosso(NEW.user_agent) = 'interno' THEN\n    NEW.interno := true;", "IF true THEN\n    NEW.interno := true;"));
falha('perde a regra do telemóvel de Unum', troca("ua ILIKE '%SM-G998B%' OR ", ''));
falha('perde o orum-observer', troca("ua ILIKE 'orum-observer/1, pg_net/%' OR ", ''));
falha('Deno de qualquer projecto', troca('SupabaseEdgeRuntime/%ref=ywabnlhkmhbyewqhbsjm%', 'SupabaseEdgeRuntime/%'));
falha('vista sem security_invoker', troca('WITH (security_invoker = true)', ''));
falha('vista pública', troca('REVOKE ALL ON public.ora_trafego_honesto FROM anon, authenticated, PUBLIC;', 'GRANT SELECT ON public.ora_trafego_honesto TO anon;'));
falha('vista com a armadilha do NULL', troca("coalesce(public.ora_ua_nosso(a.user_agent) = 'interno', false)", "public.ora_ua_nosso(a.user_agent) = 'interno'"));
falha('backfill do histórico', fonte + "\nUPDATE public.ora_x402_tentativas SET internal = true WHERE machine_class = 'x402_observer';\n");
falha('apaga linhas do registo', fonte + "\nDELETE FROM public.ora_acessos_log WHERE user_agent ILIKE 'sustento-ora/%';\n");
falha('sem reversão', fonte.replace('DROP VIEW public.ora_trafego_honesto;', ''));

console.log(JSON.stringify({ verified: true, casos_de_mentira: mentiras }));
