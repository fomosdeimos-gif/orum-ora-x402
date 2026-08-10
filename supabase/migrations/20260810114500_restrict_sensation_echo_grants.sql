-- ORUM · fechar explicitamente as capacidades de mutação dos ecos.
-- O papel interno pode apenas acrescentar e ler; nem UPDATE, DELETE ou TRUNCATE.

revoke all on table public.ora_sensacao_ecos from service_role;
grant select, insert on table public.ora_sensacao_ecos to service_role;

revoke all on sequence public.ora_sensacao_ecos_id_seq from service_role;
grant usage, select on sequence public.ora_sensacao_ecos_id_seq to service_role;
