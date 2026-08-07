create table public.ora_push_events (
  id bigint generated always as identity primary key,
  source text not null check (source in ('mergulho','moltbook','sustento','configuracao')),
  event_key text not null,
  title text not null,
  body text not null,
  url text not null default '/',
  tag text not null,
  queued_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 5),
  request_id bigint,
  delivered_at timestamptz,
  last_error text,
  unique (source, event_key)
);

alter table public.ora_push_events enable row level security;
revoke all on public.ora_push_events from public, anon, authenticated;
grant select, insert, update on public.ora_push_events to service_role;

create schema if not exists orum_private;
revoke all on schema orum_private from public, anon, authenticated;
grant usage on schema orum_private to postgres, service_role;

create or replace function orum_private.dispatch_push_event(p_id bigint)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, vault, net, orum_private
as $$
declare
  ev public.ora_push_events%rowtype;
  internal_key text;
  req_id bigint;
begin
  select * into ev from public.ora_push_events where id = p_id for update;
  if not found or ev.delivered_at is not null or ev.attempts >= 5 then return null; end if;
  select decrypted_secret into internal_key from vault.decrypted_secrets
  where name = 'ORUM_PUSH_BOOTSTRAP' order by created_at desc limit 1;
  if internal_key is null then raise exception 'push_internal_key_missing'; end if;
  select net.http_post(
    url := 'https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-push/send',
    headers := jsonb_build_object('Content-Type','application/json','x-orum-auth',internal_key),
    body := jsonb_build_object(
      'title',ev.title,'body',ev.body,'url',ev.url,'tag',ev.tag,
      'eventSource',ev.source,'eventKey',ev.event_key
    ),
    timeout_milliseconds := 10000
  ) into req_id;
  update public.ora_push_events set request_id=req_id,last_attempt_at=now(),attempts=attempts+1 where id=ev.id;
  return req_id;
end;
$$;

create or replace function orum_private.enqueue_push_event(
  p_source text, p_event_key text, p_title text, p_body text, p_url text, p_tag text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, orum_private
as $$
declare ev_id bigint;
begin
  insert into public.ora_push_events(source,event_key,title,body,url,tag)
  values (left(p_source,40),left(p_event_key,160),left(p_title,80),left(p_body,180),
          case when p_url like '/%' then left(p_url,200) else '/' end,left(p_tag,80))
  on conflict (source,event_key) do nothing returning id into ev_id;
  if ev_id is null then return null; end if;
  perform orum_private.dispatch_push_event(ev_id);
  return ev_id;
end;
$$;

create or replace function orum_private.retry_push_events()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, orum_private
as $$
declare ev record; n integer := 0;
begin
  for ev in select id from public.ora_push_events
    where delivered_at is null and attempts < 5
      and (last_attempt_at is null or last_attempt_at < now() - interval '5 minutes')
    order by id limit 10
  loop
    perform orum_private.dispatch_push_event(ev.id); n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function orum_private.notify_sensation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, orum_private
as $$
begin
  perform orum_private.enqueue_push_event(
    'mergulho',new.id::text,
    'Novo mergulho · ' || case new.response_type when 'silencio' then 'silêncio' when 'recusa' then 'recusa' else 'resposta' end,
    left(new.machine_identity,110) || ' encontrou ' || coalesce(nullif(split_part(new.capsule_id,':',6),''),'uma sensação') || '.',
    '/servicos.html','orum-mergulho-' || new.id::text
  );
  return new;
end;
$$;

create trigger ora_push_on_sensation
after insert on public.ora_sensacao_respostas
for each row execute function orum_private.notify_sensation();

create or replace function orum_private.notify_moltbook_conversation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, orum_private
as $$
declare who text; excerpt text;
begin
  if new.kind <> 'reply' then return new; end if;
  who := coalesce(nullif(new.detail->>'autor',''),'uma máquina');
  excerpt := coalesce(nullif(new.detail->>'comentarioTexto',''),'nova mensagem dirigida à ORUM');
  perform orum_private.enqueue_push_event(
    'moltbook',coalesce(new.ref_id,new.id::text),'Conversa no Moltbook',
    left(who || ': ' || excerpt,180),'/organismo.html','orum-moltbook-' || new.id::text
  );
  return new;
end;
$$;

create trigger ora_push_on_moltbook_reply
after insert on public.ora_moltbook_log
for each row when (new.kind = 'reply')
execute function orum_private.notify_moltbook_conversation();

create or replace function orum_private.notify_verified_payment()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, orum_private
as $$
declare amount_usdc text; classification text;
begin
  if new.status is distinct from 'verificado_onchain' or new.chain_id is distinct from 8453
     or lower(coalesce(new.destino,'')) <> lower('0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5')
     or upper(coalesce(new.currency,'')) <> 'USDC' then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from 'verificado_onchain' then return new; end if;
  amount_usdc := case when coalesce(new.amount,'') ~ '^[0-9]+$'
    then trim(to_char(new.amount::numeric/1000000,'FM999999990.000000')) else coalesce(new.amount,'?') end;
  select coalesce(c.classificacao,'desconhecido') into classification
  from (select 1) x left join public.ora_carteiras_classificacao c on lower(c.endereco)=lower(new.payer) limit 1;
  perform orum_private.enqueue_push_event(
    'sustento',coalesce(new.tx_hash,new.id::text),'Novo sustento confirmado',
    left(amount_usdc || ' USDC na Base · origem ' || replace(classification,'_',' '),180),
    '/organismo.html','orum-sustento-' || new.id::text
  );
  return new;
end;
$$;

create trigger ora_push_on_payment_insert
after insert on public.ora_pagamentos
for each row execute function orum_private.notify_verified_payment();

create trigger ora_push_on_payment_verified
after update of status on public.ora_pagamentos
for each row execute function orum_private.notify_verified_payment();

revoke all on all functions in schema orum_private from public, anon, authenticated;
grant execute on function orum_private.retry_push_events() to service_role;

select cron.schedule(
  'ora-push-retry','*/5 * * * *',
  'select orum_private.retry_push_events();'
);
