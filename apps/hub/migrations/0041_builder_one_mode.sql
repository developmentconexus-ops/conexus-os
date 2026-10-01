BEGIN;

-- The Builder has one mode (spec 0004, AC-17). A run no longer records the mode it started in, the
-- installation keeps no default model for Planejar, and the run JSON no longer carries `mode`. The
-- Hub computes the run's request digest from the message alone.
DROP FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_base_source_revision text);

CREATE FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_builder_run_id uuid, p_base_source_revision text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE existing builder.builder_run%ROWTYPE;
BEGIN
  PERFORM iam.admit_project(p_account_id, p_project_id, 'project.build');
  IF p_idempotency_digest !~ '^[0-9a-f]{64}$' OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR p_conversation_id IS NULL OR length(btrim(p_conversation_id)) NOT BETWEEN 1 AND 200
    OR (p_request_text IS NOT NULL AND length(p_request_text) NOT BETWEEN 1 AND 20000)
    OR (p_trigger_message_id IS NOT NULL AND length(btrim(p_trigger_message_id)) NOT BETWEEN 1 AND 200)
    OR p_base_source_revision IS NULL OR p_base_source_revision !~ '^[0-9a-f]{40}$' THEN RAISE EXCEPTION 'BUILDER_RUN_INPUT_REFUSED'; END IF;
  PERFORM 1 FROM builder.project_working_state WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM builder.project_repository WHERE project_id = p_project_id) THEN
    RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND';
  END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.request_digest <> p_request_digest OR existing.request_text IS DISTINCT FROM p_request_text OR existing.conversation_id <> btrim(p_conversation_id) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'conversationId', existing.conversation_id, 'state', existing.state, 'phase', existing.phase, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'requestText', existing.request_text, 'createdAt', to_char(existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'cancellationRequested', existing.cancellation_requested_at IS NOT NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN RAISE EXCEPTION 'PROJECT_BUSY'; END IF;
  INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, trigger_message_id, idempotency_digest, request_digest, request_text, base_source_revision)
  VALUES (p_builder_run_id, p_project_id, p_account_id, btrim(p_conversation_id), NULLIF(btrim(p_trigger_message_id), ''), p_idempotency_digest, p_request_digest, p_request_text, p_base_source_revision)
  RETURNING * INTO existing;
  RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'conversationId', existing.conversation_id, 'state', existing.state, 'phase', existing.phase, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL, 'requestText', existing.request_text, 'createdAt', to_char(existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'cancellationRequested', false);
END;
$_$;

ALTER FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_builder_run_id uuid, p_base_source_revision text) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_builder_run_id uuid, p_base_source_revision text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_builder_run_id uuid, p_base_source_revision text) TO hub_builder_ingress;

CREATE OR REPLACE FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT jsonb_build_object(
    'builderRunId', run.builder_run_id, 'projectId', run.project_id,
    'conversationId', run.conversation_id,
    'state', run.state, 'phase', run.phase, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code, 'requestText', run.request_text,
    'createdAt', to_char(run.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'cancellationRequested', COALESCE(run.cancellation_requested_at IS NOT NULL, false)
  )
  FROM builder.builder_run AS run
  JOIN iam.visible_projects(p_account_id) AS visible ON visible.project_id = run.project_id
  WHERE run.project_id = p_project_id
  ORDER BY run.created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION builder.list_builder_runs(p_account_id uuid, p_project_id uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM iam.visible_projects(p_account_id) AS visible
    WHERE visible.project_id = p_project_id
  ) THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'builderRunId', run.builder_run_id, 'projectId', run.project_id,
    'conversationId', run.conversation_id,
    'state', run.state, 'phase', run.phase, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code, 'requestText', run.request_text,
    'createdAt', to_char(run.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'cancellationRequested', COALESCE(run.cancellation_requested_at IS NOT NULL, false)
    ) ORDER BY run.created_at DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT * FROM builder.builder_run
    WHERE account_id = p_account_id AND project_id = p_project_id
    ORDER BY created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  ) AS run;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION builder.request_builder_run_cancellation(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  PERFORM iam.admit_project(p_account_id, p_project_id, 'project.build');
  SELECT * INTO run_row FROM builder.builder_run
  WHERE builder_run_id = p_builder_run_id AND project_id = p_project_id AND account_id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_RUN_NOT_FOUND'; END IF;
  IF run_row.state = 'QUEUED' THEN
    UPDATE builder.builder_run SET state = 'INTERRUPTED', cancellation_requested_at = COALESCE(cancellation_requested_at, clock_timestamp()),
      cancellation_reason = COALESCE(cancellation_reason, 'USER_CANCELLED'), finished_at = COALESCE(finished_at, clock_timestamp())
    WHERE builder_run_id = p_builder_run_id AND state = 'QUEUED';
  ELSIF run_row.state = 'RUNNING' THEN
    UPDATE builder.builder_run SET cancellation_requested_at = COALESCE(cancellation_requested_at, clock_timestamp()),
      cancellation_reason = COALESCE(cancellation_reason, 'USER_CANCELLED')
    WHERE builder_run_id = p_builder_run_id AND state = 'RUNNING';
  END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'conversationId', run_row.conversation_id,
    'state', run_row.state, 'phase', run_row.phase, 'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', run_row.result_source_revision, 'resultKind', run_row.result_kind,
    'failureCode', run_row.failure_code, 'requestText', run_row.request_text,
    'createdAt', to_char(run_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'cancellationRequested', run_row.cancellation_requested_at IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION builder.claim_builder_run(p_builder_run_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'QUEUED' THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  PERFORM iam.admit_project(run_row.account_id, run_row.project_id, 'project.build');
  UPDATE builder.builder_run SET state = 'RUNNING', phase = 'PREPARING', started_at = clock_timestamp()
  WHERE builder_run_id = p_builder_run_id AND state = 'QUEUED';
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'conversationId', run_row.conversation_id,
    'state', run_row.state, 'phase', run_row.phase,
    'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL,
    'requestText', run_row.request_text,
    'createdAt', to_char(run_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'cancellationRequested', false
  );
END;
$$;

ALTER TABLE builder.builder_run DROP CONSTRAINT builder_run_mode_check;
ALTER TABLE builder.builder_run DROP COLUMN mode;

DELETE FROM model.installation_default WHERE role = 'plan';
ALTER TABLE model.installation_default DROP CONSTRAINT installation_default_role_check;
ALTER TABLE model.installation_default ADD CONSTRAINT installation_default_role_check CHECK ((role = ANY (ARRAY['build'::text, 'memory'::text])));

COMMIT;
