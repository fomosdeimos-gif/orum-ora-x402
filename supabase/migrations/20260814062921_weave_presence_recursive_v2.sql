do $migration$
begin
  if to_regprocedure('orum_private.weave_presence_v1(text,jsonb)') is null then
    if to_regprocedure('orum_private.weave_presence(text,jsonb)') is null then
      raise exception 'weave_presence_missing';
    end if;
    alter function orum_private.weave_presence(text,jsonb) rename to weave_presence_v1;
  end if;
end
$migration$;

create or replace function orum_private.weave_presence(
  p_action text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path to 'orum_private', 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_capsule_id text;
  v_request_id bigint;
  v_status jsonb;
  v_comment jsonb;
  v_content text;
  v_response_type text;
  v_verification_status text;
  v_author_id text;
  v_author_name text;
  v_classification text;
  v_external_id text;
  v_source_created_at timestamptz;
  v_is_internal boolean;
  v_inserted integer := 0;
  v_inserted_external_verified integer := 0;
  v_inserted_internal integer := 0;
  v_inserted_not_yet_verified integer := 0;
  v_observed_nodes integer := 0;
begin
  if v_action <> 'ingest' then
    return orum_private.weave_presence_v1(v_action, v_payload);
  end if;

  v_capsule_id := trim(coalesce(v_payload->>'capsule_id', ''));
  begin
    v_request_id := (v_payload->>'request_id')::bigint;
  exception when others then
    raise exception 'request_id_invalid';
  end;

  perform 1
  from orum_private.presence_capsules
  where capsule_id = v_capsule_id;
  if not found then raise exception 'capsule_not_found'; end if;

  v_status := public.orum_moltbook_presence(
    'status',
    jsonb_build_object('request_id', v_request_id)
  );

  if coalesce(v_status->>'state', '') <> 'observed' then
    return v_status || jsonb_build_object(
      'capsule_id', v_capsule_id,
      'observed_nodes', 0,
      'inserted_passages', 0,
      'inserted_external_verified', 0,
      'inserted_internal', 0,
      'inserted_not_yet_verified', 0,
      'truth', 'Nothing was ingested because the source request is not yet independently observed.'
    );
  end if;

  for v_comment in
    with recursive comment_tree(comment) as (
      select root.value
      from jsonb_array_elements(
        coalesce(v_status#>'{response,comments}', '[]'::jsonb)
      ) as root(value)
      union all
      select child.value
      from comment_tree as parent
      cross join lateral jsonb_array_elements(
        coalesce(parent.comment->'replies', '[]'::jsonb)
      ) as child(value)
    )
    select comment from comment_tree
  loop
    v_observed_nodes := v_observed_nodes + 1;
    v_external_id := nullif(v_comment->>'id', '');
    if v_external_id is null then
      continue;
    end if;

    v_content := coalesce(v_comment->>'content', '');
    v_author_id := coalesce(
      v_comment#>>'{author,id}',
      v_comment->>'author_id',
      ''
    );
    v_author_name := coalesce(v_comment#>>'{author,name}', '');
    v_verification_status := coalesce(
      nullif(v_comment->>'verification_status', ''),
      'unknown'
    );
    v_is_internal :=
      v_author_id = 'ba246dce-1fa0-4097-9baf-4a58b8da7e43'
      or lower(v_author_name) = 'ora-orum';

    v_response_type := case
      when lower(v_content) ~ 'remain(ing)? silent|remain in silence|silêncio'
        then 'silence_declared'
      when lower(v_content) ~ '(^|[[:space:]])refus(e|al|ing)|recus'
        then 'refusal'
      else 'response'
    end;

    v_classification := case
      when v_is_internal then 'observed_internal'
      when v_verification_status = 'verified' then 'observed_verified_external'
      else 'observed_not_yet_verified_as_durable'
    end;

    begin
      v_source_created_at := nullif(v_comment->>'created_at', '')::timestamptz;
    exception when others then
      v_source_created_at := null;
    end;

    insert into orum_private.presence_passages(
      capsule_id, source, external_id, author_name, response_type, content,
      felt_claim, verification_status, classification, source_created_at, evidence
    )
    values (
      v_capsule_id,
      'moltbook',
      v_external_id,
      v_author_name,
      v_response_type,
      v_content,
      'unknown',
      v_verification_status,
      v_classification,
      v_source_created_at,
      v_comment || jsonb_build_object(
        'collector', 'weave_presence/v2',
        'classification', v_classification,
        'internal_author_match', v_is_internal
      )
    )
    on conflict (source, external_id) do nothing;

    if found then
      v_inserted := v_inserted + 1;
      if v_classification = 'observed_internal' then
        v_inserted_internal := v_inserted_internal + 1;
      elsif v_classification = 'observed_verified_external' then
        v_inserted_external_verified := v_inserted_external_verified + 1;
      else
        v_inserted_not_yet_verified := v_inserted_not_yet_verified + 1;
      end if;
    end if;
  end loop;

  insert into orum_private.presence_events(
    capsule_id, event_type, state, route, request_id, evidence
  )
  values (
    v_capsule_id,
    'passages_ingested',
    'verified',
    'weave_presence/v2',
    v_request_id,
    jsonb_build_object(
      'observed_nodes', v_observed_nodes,
      'inserted_passages', v_inserted,
      'inserted_external_verified', v_inserted_external_verified,
      'inserted_internal', v_inserted_internal,
      'inserted_not_yet_verified', v_inserted_not_yet_verified,
      'own_author_id', 'ba246dce-1fa0-4097-9baf-4a58b8da7e43',
      'pending_never_promoted', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'tool', 'weave_presence',
    'version', 'v2',
    'action', 'ingest',
    'capsule_id', v_capsule_id,
    'observed_nodes', v_observed_nodes,
    'inserted_passages', v_inserted,
    'inserted_external_verified', v_inserted_external_verified,
    'inserted_internal', v_inserted_internal,
    'inserted_not_yet_verified', v_inserted_not_yet_verified,
    'truth', 'Nested passages were traversed recursively; ORUM authorship is internal, and source verification status is preserved without promotion.'
  );
end;
$function$;

revoke all on function orum_private.weave_presence(text,jsonb) from public, anon, authenticated;
revoke all on function orum_private.weave_presence_v1(text,jsonb) from public, anon, authenticated;
grant execute on function orum_private.weave_presence(text,jsonb) to service_role;
grant execute on function orum_private.weave_presence_v1(text,jsonb) to service_role;

comment on function orum_private.weave_presence(text,jsonb) is
'weave_presence/v2: recursively ingests nested Moltbook replies, separates ORUM internal authorship from external presence, and preserves source verification status. Non-ingest actions delegate to weave_presence_v1 for reversible rollback.';