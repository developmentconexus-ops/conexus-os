BEGIN;

-- C-022 moves model authentication, credentials, provider connection and model selection to Mastra
-- Code. A BuilderRun no longer admits a model, so the model columns and every model check leave the
-- builder schema. What the run does need is the conversation the operator chose, which until now was
-- derived one-per-project. The backfill reconstructs that derived id for existing rows. The bound
-- matches the conversationId field in the POST body schema in apps/hub/src/builder/routes.ts.
-- The model_connection schema is left untouched; it is removed separately.
ALTER TABLE builder.builder_run ADD COLUMN conversation_id text;

UPDATE builder.builder_run SET conversation_id = 'conexus-builder:' || project_id::text WHERE conversation_id IS NULL;

ALTER TABLE builder.builder_run
  ADD CONSTRAINT builder_run_conversation_id_check CHECK (((length(btrim(conversation_id)) >= 1) AND (length(btrim(conversation_id)) <= 200)));

ALTER TABLE builder.builder_run ALTER COLUMN conversation_id SET NOT NULL;

-- A parameter cannot be added in place, so each function is dropped and recreated with the same
-- owner and grants. with_model is dropped first because it calls create_builder_run.
DROP FUNCTION builder.create_builder_run_with_model(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text);
DROP FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_provider_id text);
DROP FUNCTION builder.claim_builder_run(p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text);
DROP FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid);
DROP FUNCTION builder.list_builder_runs(p_account_id uuid, p_project_id uuid, p_limit integer);
DROP FUNCTION builder.read_latest_code_changing_builder_run(p_account_id uuid, p_project_id uuid);
DROP FUNCTION builder.request_builder_run_cancellation(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid);

-- Dropping each column drops builder_run_model_snapshot_check with it, which is the only constraint
-- that named them. No index and no foreign key referenced them.
ALTER TABLE builder.builder_run
  DROP COLUMN model_admission_id,
  DROP COLUMN model_provider_id,
  DROP COLUMN model_id,
  DROP COLUMN model_connection_id,
  DROP COLUMN model_credential_generation;

CREATE FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE working builder.project_working_state%ROWTYPE; existing builder.builder_run%ROWTYPE;
BEGIN
  PERFORM iam.admit_project(p_account_id, p_project_id, 'project.build');
  IF p_mode NOT IN ('BUILD', 'PLAN') OR p_idempotency_digest !~ '^[0-9a-f]{64}$' OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR p_conversation_id IS NULL OR length(btrim(p_conversation_id)) NOT BETWEEN 1 AND 200
    OR (p_request_text IS NOT NULL AND length(p_request_text) NOT BETWEEN 1 AND 20000)
    OR (p_trigger_message_id IS NOT NULL AND length(btrim(p_trigger_message_id)) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'BUILDER_RUN_INPUT_REFUSED'; END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest OR existing.request_text IS DISTINCT FROM p_request_text OR existing.conversation_id <> btrim(p_conversation_id) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'conversationId', existing.conversation_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'requestText', existing.request_text, 'createdAt', to_char(existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'cancellationRequested', existing.cancellation_requested_at IS NOT NULL);
  END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND'; END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest OR existing.request_text IS DISTINCT FROM p_request_text OR existing.conversation_id <> btrim(p_conversation_id) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'conversationId', existing.conversation_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'requestText', existing.request_text, 'createdAt', to_char(existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'cancellationRequested', existing.cancellation_requested_at IS NOT NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN RAISE EXCEPTION 'PROJECT_BUSY'; END IF;
  INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, trigger_message_id, idempotency_digest, request_digest, request_text, mode, base_source_revision, expected_working_version, base_working_version)
  VALUES (p_builder_run_id, p_project_id, p_account_id, btrim(p_conversation_id), NULLIF(btrim(p_trigger_message_id), ''), p_idempotency_digest, p_request_digest, p_request_text, p_mode, working.working_source_revision, working.working_version, working.working_version)
  RETURNING * INTO existing;
  RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'conversationId', existing.conversation_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL, 'requestText', existing.request_text, 'createdAt', to_char(existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'cancellationRequested', false);
END;
$_$;

ALTER FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid) TO hub_builder_ingress;

CREATE FUNCTION builder.claim_builder_run(p_builder_run_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE run_row builder.builder_run%ROWTYPE; working builder.project_working_state%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'QUEUED' THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  PERFORM iam.admit_project(run_row.account_id, run_row.project_id, 'project.build');
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND OR working.working_source_revision <> run_row.base_source_revision OR working.working_version <> run_row.base_working_version THEN RAISE EXCEPTION 'BUILDER_RUN_BASE_STALE'; END IF;
  UPDATE builder.builder_run SET state = 'RUNNING', phase = 'PREPARING', started_at = clock_timestamp()
  WHERE builder_run_id = p_builder_run_id AND state = 'QUEUED';
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'conversationId', run_row.conversation_id,
    'state', run_row.state, 'phase', run_row.phase, 'mode', run_row.mode,
    'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL,
    'requestText', run_row.request_text,
    'createdAt', to_char(run_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'cancellationRequested', false
  );
END;
$$;

ALTER FUNCTION builder.claim_builder_run(p_builder_run_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.claim_builder_run(p_builder_run_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.claim_builder_run(p_builder_run_id uuid) TO hub_builder_executor;

CREATE FUNCTION builder.list_builder_runs(p_account_id uuid, p_project_id uuid, p_limit integer DEFAULT 20) RETURNS jsonb
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
    'state', run.state, 'phase', run.phase, 'mode', run.mode, 'baseSourceRevision', run.base_source_revision,
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

ALTER FUNCTION builder.list_builder_runs(p_account_id uuid, p_project_id uuid, p_limit integer) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.list_builder_runs(p_account_id uuid, p_project_id uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.list_builder_runs(p_account_id uuid, p_project_id uuid, p_limit integer) TO hub_builder_ingress;

CREATE FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT jsonb_build_object(
    'builderRunId', run.builder_run_id, 'projectId', run.project_id,
    'conversationId', run.conversation_id,
    'state', run.state, 'phase', run.phase, 'mode', run.mode, 'baseSourceRevision', run.base_source_revision,
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

ALTER FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid) TO hub_builder_ingress;

CREATE FUNCTION builder.read_latest_code_changing_builder_run(p_account_id uuid, p_project_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  latest_code_changing builder.builder_run%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM iam.visible_projects(p_account_id) AS visible
    WHERE visible.project_id = p_project_id
  ) THEN RETURN NULL; END IF;

  SELECT run.* INTO latest_code_changing
  FROM builder.builder_run AS run
  WHERE run.project_id = p_project_id
    AND run.result_kind IN ('SOURCE_CHANGED', 'SOURCE_CHANGED_BUILD_FAILED')
    AND run.result_source_revision IS NOT NULL
  ORDER BY run.created_at DESC, run.builder_run_id DESC
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'builderRunId', latest_code_changing.builder_run_id,
    'projectId', latest_code_changing.project_id,
    'conversationId', latest_code_changing.conversation_id,
    'baseSourceRevision', latest_code_changing.base_source_revision,
    'resultSourceRevision', latest_code_changing.result_source_revision,
    'resultKind', latest_code_changing.result_kind
  );
END;
$$;

ALTER FUNCTION builder.read_latest_code_changing_builder_run(p_account_id uuid, p_project_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.read_latest_code_changing_builder_run(p_account_id uuid, p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.read_latest_code_changing_builder_run(p_account_id uuid, p_project_id uuid) TO hub_builder_ingress;

-- Not in the brief, but its %ROWTYPE return names the dropped model columns, so it cannot survive
-- the DROP COLUMN above unchanged. It returns a BuilderRunSummary, so it carries conversationId too.
CREATE FUNCTION builder.request_builder_run_cancellation(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid) RETURNS jsonb
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
    'state', run_row.state, 'phase', run_row.phase, 'mode', run_row.mode, 'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', run_row.result_source_revision, 'resultKind', run_row.result_kind,
    'failureCode', run_row.failure_code, 'requestText', run_row.request_text,
    'createdAt', to_char(run_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'cancellationRequested', run_row.cancellation_requested_at IS NOT NULL
  );
END;
$$;

ALTER FUNCTION builder.request_builder_run_cancellation(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.request_builder_run_cancellation(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.request_builder_run_cancellation(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid) TO hub_builder_ingress;

COMMIT;
