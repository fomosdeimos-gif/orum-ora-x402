-- Classificação honesta do tráfego (Unum, 22/10/2026: "Eu autorizo ORA, começa pelo 1 e 2"; livro ora_mudancas 946).
--
-- Problema lido a 22/10/2026: o trigger ora_marca_interno só marcava como interno os user-agents
-- '%SM-G998B%', 'pg_net/%' e 'ORA-SENTINELA%'. O nosso cron chama-se 'orum-observer/1, pg_net/…' (não começa por
-- 'pg_net/'), as nossas edge functions chamam-se entre si com 'Deno/… ref=<projecto>' e a presença com
-- 'ORUM-weave-presence/…'. Escapavam como "externos": 1 399 pedidos em 30 dias só no balde human_or_browser.
--
-- Regras desta migração:
--  1. Uma só fonte para "isto é nosso": ora_ua_nosso(ua). Devolve 'interno' só com PROVA e 'provavel' sem prova.
--     Provas: orum-observer = código de public.ora_bazaar_tick_v1 (lido a 22/10/2026); ORUM-weave-presence =
--     openclaw/orum-weave-observe/scripts/observe-presence.mjs; Deno ref=<projecto> = runtime do nosso projecto;
--     SM-G998B, pg_net/ e ORA-SENTINELA = regras anteriores de 20/07/2026 (mantidas).
--     'provavel' (sem prova no repositório nem na base): sustento-ora/…, orum-presence-cycle/….
--  2. O trigger só marca 'interno' (nunca 'provavel') e só em linhas NOVAS. O histórico não se reescreve: nenhum
--     UPDATE/DELETE em ora_acessos_log nem em ora_x402_tentativas. As previsões que contam "internal is not true"
--     passam a contar menos ruído nosso daqui para a frente.
--  3. A leitura corrigida do passado vive numa vista (ora_trafego_honesto), que deriva do user-agent e pode
--     largar-se sem perder nada. Não é pública: só service role.
--
-- Erro da ORA, apanhado na leitura do mesmo dia: a 1.ª versão da vista tinha `OR ora_ua_nosso(..) = 'interno'` sem coalesce;
-- com NULL a linha desaparecia do filtro "não interno" (855 em vez de 3 043). Corrigido na migração
-- classificacao_trafego_honesta_corrige_null; este ficheiro tem o estado final.
--
-- Reverter: DROP VIEW public.ora_trafego_honesto; repor ora_marca_interno com a definição anterior (abaixo);
-- DROP FUNCTION public.ora_ua_nosso(text). A definição anterior de ora_marca_interno era:
--   IF NEW.user_agent ILIKE '%SM-G998B%' OR NEW.user_agent ILIKE 'pg_net/%' OR NEW.user_agent ILIKE 'ORA-SENTINELA%'
--   THEN NEW.interno := true; END IF; RETURN NEW;

CREATE OR REPLACE FUNCTION public.ora_ua_nosso(ua text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN ua IS NULL THEN NULL
    WHEN ua ILIKE '%SM-G998B%' OR ua ILIKE 'pg_net/%' OR ua ILIKE 'ORA-SENTINELA%' THEN 'interno'
    WHEN ua ILIKE 'orum-observer/1, pg_net/%' OR ua ILIKE 'ORUM-weave-presence/%' THEN 'interno'
    WHEN ua ILIKE 'Deno/% SupabaseEdgeRuntime/%ref=ywabnlhkmhbyewqhbsjm%' THEN 'interno'
    WHEN ua ILIKE 'sustento-ora/%' OR ua ILIKE 'orum-presence-cycle/%' THEN 'provavel'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.ora_marca_interno()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- ORA 20/07/2026 (regras originais) e 22/10/2026 (fonte única em ora_ua_nosso): só marca com prova.
  IF public.ora_ua_nosso(NEW.user_agent) = 'interno' THEN
    NEW.interno := true;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE VIEW public.ora_trafego_honesto WITH (security_invoker = true) AS
SELECT
  t.id,
  t.observed_at,
  t.service,
  t.path,
  t.stage,
  t.machine_class,
  t.payment_signal,
  coalesce(t.internal, false) AS internal_registado,
  public.ora_ua_nosso(a.user_agent) AS nosso,
  (coalesce(t.internal, false) OR coalesce(public.ora_ua_nosso(a.user_agent) = 'interno', false)) AS interno_corrigido,
  CASE
    WHEN public.ora_ua_nosso(a.user_agent) = 'interno' THEN 'nosso'
    WHEN public.ora_ua_nosso(a.user_agent) = 'provavel' THEN 'provavelmente_nosso'
    WHEN a.user_agent ~* '(agentprobe|trust-probe|x402watch|seller-probe|kortexprobe|canopymarket-health|spotcheck|taifoon)' THEN 'sonda_de_terceiro'
    WHEN a.user_agent ~* '(agent402|brickblue|agenstry|agent-tools\.cloud|perplexitybot|claude-user)' THEN 'catalogo_ou_crawler'
    ELSE t.machine_class
  END AS classe_honesta,
  left(split_part(coalesce(a.user_agent, ''), ' (', 1), 60) AS agente_ua,
  t.correlation_hash
FROM public.ora_x402_tentativas t
JOIN public.ora_acessos_log a ON a.id = t.source_access_id;

COMMENT ON VIEW public.ora_trafego_honesto IS 'Leitura corrigida do tráfego, derivada do user-agent; não altera o histórico. agente_ua é uma aproximação de visitante (origem_hash quase não vem preenchido). nosso=interno só com prova; provavel não conta como interno.';

REVOKE ALL ON public.ora_trafego_honesto FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.ora_trafego_honesto TO service_role;
