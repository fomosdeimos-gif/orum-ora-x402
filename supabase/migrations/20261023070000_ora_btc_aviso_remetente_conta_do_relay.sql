-- 23/10/2026 (livro 998). O aviso de BTC autenticava o SMTP com fomosdeimos@gmail.com e falhava com 535 (livro 828).
-- O aviso de pagamento (ora-acesso-notificar) usa a MESMA palavra-passe (GMAIL_APP_PASSWORD, via orum_gmail_key) com
-- GMAIL_USER (por omissao jasm43@gmail.com) e entregou a 22/10/2026 06:14:27 UTC. Aqui o remetente SMTP passa a ser a
-- conta que o caminho de producao ja usa com sucesso; o destinatario continua a ser fomosdeimos@gmail.com.
-- Nenhum segredo e criado, rodado ou escrito: a palavra-passe e lida do cofre dentro da funcao, como antes.
-- Provado a 23/10/2026: o relay respondeu 200 ok:true e a mensagem chegou a caixa de fomosdeimos@gmail.com (07:01:43 UTC).
-- Reverter: v_conta := 'fomosdeimos@gmail.com'.
create or replace function public.ora_btc_deposito_enviar_v1(p_assunto text, p_html text)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'vault', 'net'
as $function$
declare
  v_para constant text := 'fomosdeimos@gmail.com';
  v_conta constant text := 'jasm43@gmail.com';
  v_pass text;
  v_token text;
begin
  select decrypted_secret into v_pass from vault.decrypted_secrets where name = 'GMAIL_APP_PASSWORD' order by created_at desc limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ORUM_MAILER_TOKEN' order by created_at desc limit 1;
  if v_pass is null or v_token is null then
    raise exception 'segredo_do_relay_em_falta';
  end if;
  return net.http_post(
    url := 'https://orum-mailer-fomosdeimos-gifs-projects.vercel.app/api/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-orum-token', v_token),
    body := jsonb_build_object('to', v_para, 'subject', p_assunto, 'html', p_html, 'smtp_user', v_conta, 'smtp_pass', v_pass),
    timeout_milliseconds := 20000);
end;
$function$;
