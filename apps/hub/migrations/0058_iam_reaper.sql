BEGIN;

-- The one way an expired row goes (spec 0013). Each rule carries its own deadline as a literal in the
-- statement that applies it, selects at most p_limit root rows in deadline order and skips rows another
-- transaction holds. The answer is one row per rule, in this order, removed 0 included; `removed`
-- counts root rows only. Safe to repeat: once drained, a second call with the same p_now changes nothing.
CREATE FUNCTION iam.reap_expired(p_now timestamp with time zone, p_limit integer)
    RETURNS TABLE(relation text, action text, removed integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  digest bytea;
  previews uuid[];
  n integer;
BEGIN
  -- A handoff lives 30 to 60 seconds and carries a sealed refresh token: gone at expiry.
  DELETE FROM iam.handoff WHERE handoff_digest IN (
    SELECT handoff_digest FROM iam.handoff WHERE expires_at <= p_now
    ORDER BY expires_at, handoff_digest LIMIT p_limit FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS n = ROW_COUNT;
  relation := 'iam.handoff'; action := 'DELETED'; removed := n; RETURN NEXT;

  -- A Preview ends fifteen minutes after launch and nothing of it is kept (0026): its sessions go with
  -- it. The handoffs it was entered through went in the rule above; one a truncated batch left makes
  -- its Preview wait for the next pass.
  SELECT coalesce(array_agg(preview_id), '{}') INTO previews FROM (
    SELECT preview_id FROM iam.preview AS expired
    WHERE expires_at <= p_now
      AND NOT EXISTS (SELECT 1 FROM iam.handoff AS pending WHERE pending.preview_id = expired.preview_id)
    ORDER BY expires_at, preview_id LIMIT p_limit FOR UPDATE SKIP LOCKED) AS selected;
  DELETE FROM iam.host_session WHERE preview_id = ANY(previews);
  DELETE FROM iam.preview WHERE preview_id = ANY(previews);
  GET DIAGNOSTICS n = ROW_COUNT;
  relation := 'iam.preview'; action := 'DELETED'; removed := n; RETURN NEXT;

  -- An open Hub or application session past a limit is ended the way every session ends, which drops
  -- its sealed refresh token.
  n := 0;
  FOR digest IN
    SELECT token_digest FROM iam.host_session
    WHERE kind IN ('HUB', 'APPLICATION') AND ended_at IS NULL
      AND (absolute_expires_at <= p_now OR idle_expires_at <= p_now)
    ORDER BY least(absolute_expires_at, idle_expires_at), token_digest LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM iam.end_host_session(digest, 'EXPIRED');
    n := n + 1;
  END LOOP;
  relation := 'iam.host_session'; action := 'ENDED'; removed := n; RETURN NEXT;

  -- An ended session is kept 72 hours, then deleted once no child session or handoff names it.
  DELETE FROM iam.host_session WHERE token_digest IN (
    SELECT token_digest FROM iam.host_session AS ended
    WHERE ended_at <= p_now - interval '72 hours'
      AND NOT EXISTS (SELECT 1 FROM iam.host_session AS child WHERE child.parent_digest = ended.token_digest)
      AND NOT EXISTS (SELECT 1 FROM iam.handoff AS pending WHERE pending.parent_digest = ended.token_digest)
    ORDER BY ended_at, token_digest LIMIT p_limit FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS n = ROW_COUNT;
  relation := 'iam.host_session'; action := 'DELETED'; removed := n; RETURN NEXT;

  -- A sign-in that never came back, or came back long ago, reads as missing: kept 24 hours.
  DELETE FROM iam.oidc_transaction WHERE state_digest IN (
    SELECT state_digest FROM iam.oidc_transaction WHERE expires_at <= p_now - interval '24 hours'
    ORDER BY expires_at, state_digest LIMIT p_limit FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS n = ROW_COUNT;
  relation := 'iam.oidc_transaction'; action := 'DELETED'; removed := n; RETURN NEXT;

  -- A bootstrap context is kept 24 hours past expiry and its IAM-03 receipt goes with it, in the same
  -- statement: the receipt is read only through the context, so it never outlives it and never goes first.
  WITH gone AS (
    DELETE FROM iam.bootstrap_context WHERE token_digest IN (
      SELECT token_digest FROM iam.bootstrap_context WHERE expires_at <= p_now - interval '24 hours'
      ORDER BY expires_at, token_digest LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING issuer, external_subject
  ), receipts AS (
    DELETE FROM iam.operation_idempotency AS receipt USING gone
    WHERE receipt.operation_id = 'IAM-03'
      AND receipt.authority_scope = 'bootstrap:' || gone.issuer || ':' || gone.external_subject
  )
  SELECT count(*) INTO n FROM gone;
  relation := 'iam.bootstrap_context'; action := 'DELETED'; removed := n; RETURN NEXT;

  -- An invitation nobody accepted shows as expired for 30 days, so the person can invite again, then goes.
  DELETE FROM iam.workspace_invitation WHERE invitation_id IN (
    SELECT invitation_id FROM iam.workspace_invitation WHERE expires_at <= p_now - interval '30 days'
    ORDER BY expires_at, invitation_id LIMIT p_limit FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS n = ROW_COUNT;
  relation := 'iam.workspace_invitation'; action := 'DELETED'; removed := n; RETURN NEXT;

  DELETE FROM iam.application_invitation WHERE invitation_id IN (
    SELECT invitation_id FROM iam.application_invitation WHERE expires_at <= p_now - interval '30 days'
    ORDER BY expires_at, invitation_id LIMIT p_limit FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS n = ROW_COUNT;
  relation := 'iam.application_invitation'; action := 'DELETED'; removed := n; RETURN NEXT;
END;
$$;

ALTER FUNCTION iam.reap_expired(p_now timestamp with time zone, p_limit integer) OWNER TO iam_owner;
REVOKE ALL ON FUNCTION iam.reap_expired(p_now timestamp with time zone, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.reap_expired(p_now timestamp with time zone, p_limit integer) TO hub_iam_runtime;

-- The reaper is the one way an expired row goes: these two no longer delete other rows on expiry.
CREATE OR REPLACE FUNCTION iam.mint_application_handoff(p_account_id uuid, p_project_id uuid, p_handoff_digest bytea, p_binding_digest bytea, p_refresh_token text, p_authenticated_at timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF NOT iam.has_application_access(p_account_id, p_project_id) THEN
    RETURN false;
  END IF;
  INSERT INTO iam.handoff (handoff_digest, kind, account_id, project_id, binding_digest, provider_refresh_token, minted_at, expires_at)
  VALUES (p_handoff_digest, 'APPLICATION', p_account_id, p_project_id, p_binding_digest, p_refresh_token, p_authenticated_at, p_authenticated_at + interval '60 seconds');
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION iam.open_preview(p_hub_session_digest bytea, p_account_id uuid, p_project_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_artifact_digest text, p_exact_host text, p_manifest jsonb, p_handoff_digest bytea, p_now timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  opened uuid := gen_random_uuid();
BEGIN
  IF NOT iam.hub_session_live(p_hub_session_digest, p_account_id, p_now) THEN
    RETURN NULL;
  END IF;
  INSERT INTO iam.preview (preview_id, account_id, project_id, source_revision, artifact_revision_id, artifact_digest, exact_host, manifest, opened_at, expires_at)
  VALUES (opened, p_account_id, p_project_id, p_source_revision, p_artifact_revision_id, p_artifact_digest, p_exact_host, p_manifest, p_now, p_now + interval '15 minutes');
  INSERT INTO iam.handoff (handoff_digest, kind, account_id, preview_id, parent_digest, minted_at, expires_at)
  VALUES (p_handoff_digest, 'PREVIEW', p_account_id, opened, p_hub_session_digest, p_now, p_now + interval '30 seconds');
  RETURN p_now + interval '15 minutes';
END;
$$;

-- A Project deletion started during a sign-in into its application no longer fails on the
-- transaction that names the application.
CREATE OR REPLACE FUNCTION iam.purge_project(p_project_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM iam.handoff
  WHERE project_id = p_project_id
     OR preview_id IN (SELECT preview_id FROM iam.preview WHERE project_id = p_project_id);
  DELETE FROM iam.host_session
  WHERE project_id = p_project_id
     OR preview_id IN (SELECT preview_id FROM iam.preview WHERE project_id = p_project_id);
  DELETE FROM iam.preview WHERE project_id = p_project_id;
  DELETE FROM iam.application_grant WHERE project_id = p_project_id;
  DELETE FROM iam.application_invitation WHERE project_id = p_project_id;
  DELETE FROM iam.oidc_transaction WHERE application_project_id = p_project_id;
  DELETE FROM iam.application WHERE project_id = p_project_id;
END;
$$;

COMMIT;
