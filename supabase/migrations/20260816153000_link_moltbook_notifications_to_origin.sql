-- Conserva a origem real das conversas Moltbook nas notificacoes e na Voz.

create or replace function orum_private.notify_moltbook_conversation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, orum_private
as $$
declare
  who text;
  excerpt text;
  post_id text;
  target_url text;
begin
  if new.kind <> 'reply' then return new; end if;

  who := coalesce(nullif(new.detail->>'autor',''),'uma máquina');
  excerpt := coalesce(nullif(new.detail->>'comentarioTexto',''),'nova mensagem dirigida à ORUM');
  post_id := nullif(new.detail->>'postId','');
  target_url := case
    when post_id ~* '^[0-9a-f-]{36}$'
      then 'https://www.moltbook.com/post/' || post_id
    else '/organismo.html'
  end;

  perform orum_private.enqueue_push_event(
    'moltbook', coalesce(new.ref_id,new.id::text), 'Conversa no Moltbook',
    left(who || ': ' || excerpt,180), target_url, 'orum-moltbook-' || new.id::text
  );
  return new;
end;
$$;

create or replace view public.ora_moltbook_publica as
select
  created_at as quando,
  kind,
  case
    when kind = 'post' then detail->>'title'
    when kind = any (array['reply','comment_reply'])
      then left(coalesce(detail->>'content', detail->>'comentarioTexto'), 240)
    else null
  end as resumo,
  case
    when kind = any (array['reply','comment_reply']) then detail->>'autor'
    else null
  end as em_resposta_a,
  case
    when coalesce(nullif(detail->>'postId',''), nullif(ref_id,'')) ~* '^[0-9a-f-]{36}$'
      then 'https://www.moltbook.com/post/' || coalesce(nullif(detail->>'postId',''), nullif(ref_id,''))
    else null
  end as origem_url
from public.ora_moltbook_log
where kind = any (array['post','reply','comment_reply'])
order by created_at desc
limit 30;

comment on view public.ora_moltbook_publica is
  'Voz publica sanitizada com permalink verificavel da origem Moltbook quando o post_id e conhecido.';
