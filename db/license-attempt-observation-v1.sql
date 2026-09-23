-- Additive telemetry only. Legacy stage/outcome and prediction inputs stay unchanged.
SET lock_timeout = '5s';
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.orum_capture_x402_attempt()'::regprocedure)) <> '14e26c6ad8891c221fddf7b64820e4b5' THEN
    RAISE EXCEPTION 'capture function changed; rebase before applying';
  END IF;
END $guard$;
ALTER TABLE public.ora_acessos_log ADD COLUMN x402_observation jsonb;
ALTER TABLE public.ora_x402_tentativas ADD COLUMN x402_observation jsonb;
DO $patch$
DECLARE original text; updated text;
BEGIN
  original := pg_get_functiondef('public.orum_capture_x402_attempt()'::regprocedure);
  updated := replace(original, 'payment_signal, internal', 'payment_signal, internal, x402_observation');
  updated := replace(updated, 'coalesce(new.tem_pagamento, false), coalesce(new.interno, false)', 'coalesce(new.tem_pagamento, false), coalesce(new.interno, false), new.x402_observation');
  IF updated = original OR position('new.x402_observation' in updated) = 0 THEN
    RAISE EXCEPTION 'unexpected capture definition';
  END IF;
  EXECUTE updated;
END $patch$;
COMMENT ON COLUMN public.ora_acessos_log.x402_observation IS 'Server-observed license milestones v1; null for historical/uninstrumented requests. Not buyer identity, external revenue, or client receipt.';
COMMENT ON COLUMN public.ora_x402_tentativas.x402_observation IS 'Copy of source observation, not independent evidence. Legacy classifier unchanged.';

