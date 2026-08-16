-- Completa a proveniencia de duas respostas ja publicadas antes do reparo v25.
-- O post_id e confirmado pelo registo push_moltbook_send #595, que conserva
-- ambas as referencias e o mesmo post 28cbf0ca-9ab7-4d06-a94b-b14a40415b35.

update public.ora_moltbook_log
set detail = detail || jsonb_build_object(
  'postId', '28cbf0ca-9ab7-4d06-a94b-b14a40415b35',
  'provenance_reconciled_from_log', 595
)
where kind = 'reply'
  and detail->>'repair' = 'v25'
  and ref_id = any (array[
    '61f67c7e-41ef-4b0e-93a5-d73e22d730b9',
    '88c393c3-0c2d-47f8-994a-a23a484ff441'
  ]);

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
    when kind = 'post' and ref_id ~* '^[0-9a-f-]{36}$'
      then 'https://www.moltbook.com/post/' || ref_id
    when kind = any (array['reply','comment_reply'])
      and nullif(detail->>'postId','') ~* '^[0-9a-f-]{36}$'
      then 'https://www.moltbook.com/post/' || (detail->>'postId')
    else null
  end as origem_url
from public.ora_moltbook_log
where kind = any (array['post','reply','comment_reply'])
order by created_at desc
limit 30;

comment on view public.ora_moltbook_publica is
  'Voz publica sanitizada com permalink verificavel da origem Moltbook quando o post_id e conhecido; IDs de comentarios nunca sao tratados como posts.';
