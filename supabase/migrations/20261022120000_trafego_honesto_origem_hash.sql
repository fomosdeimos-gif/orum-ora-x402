-- Acrescenta origem_hash à vista ora_trafego_honesto (Unum, 22/10/2026: "Eu autorizo ORA"; livro ora_mudancas 961).
-- Só leitura: a vista deriva de ora_acessos_log; nada do histórico é reescrito. origem_hash é o visitante aproximado
-- (SHA-256 com sal de IP + user-agent, 24 hex) que as três portas pagas passam a gravar; as linhas antigas ficam NULL.
-- Reverter: repor a definição da migração 20261022100000 (sem a última coluna).
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
  t.correlation_hash,
  a.origem_hash
FROM public.ora_x402_tentativas t
JOIN public.ora_acessos_log a ON a.id = t.source_access_id;

COMMENT ON VIEW public.ora_trafego_honesto IS 'Leitura corrigida do tráfego, derivada do user-agent; não altera o histórico. agente_ua é uma aproximação de visitante; origem_hash (desde 22/10/2026, IP+user-agent com sal) conta visitantes distintos de forma aproximada. nosso=interno só com prova; provavel não conta como interno.';

REVOKE ALL ON public.ora_trafego_honesto FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.ora_trafego_honesto TO service_role;
