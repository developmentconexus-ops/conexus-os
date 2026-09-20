BEGIN;

-- The run stored only a digest of the request, and trigger_message_id is never bound before the
-- agent starts, so a run that failed during preparation left no way to reconstruct the operator's
-- own words. request_text keeps them on the row. Existing rows keep NULL. The bound matches the
-- POST body schema in apps/hub/src/builder/routes.ts.
ALTER TABLE builder.builder_run ADD COLUMN request_text text;

ALTER TABLE builder.builder_run
  ADD CONSTRAINT builder_run_request_text_check CHECK (((request_text IS NULL) OR (length(request_text) >= 1 AND length(request_text) <= 20000)));

-- A parameter cannot be added in place, so each function is dropped and recreated with the same
-- owner and grants. with_model is dropped first because it calls create_builder_run.
DROP FUNCTION builder.create_builder_run_with_model(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text);
DROP FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_provider_id text);
DROP FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid);
DROP FUNCTION builder.list_builder_runs(p_account_id uuid, p_project_id uuid, p_limit integer);
DROP FUNCTION builder.request_builder_run_cancellation(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid);

CREATE FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_provider_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE working builder.project_working_state%ROWTYPE; existing builder.builder_run%ROWTYPE;
  selected_connection_id uuid; selected_generation bigint;
BEGIN
  PERFORM iam.admit_project(p_account_id, p_project_id, 'project.build');
  IF p_mode NOT IN ('BUILD', 'PLAN') OR p_idempotency_digest !~ '^[0-9a-f]{64}$' OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR (p_request_text IS NOT NULL AND length(p_request_text) NOT BETWEEN 1 AND 20000)
    OR (p_trigger_message_id IS NOT NULL AND length(btrim(p_trigger_message_id)) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'BUILDER_RUN_INPUT_REFUSED'; END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest OR existing.request_text IS DISTINCT FROM p_request_text THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'requestText', existing.request_text, 'createdAt', to_char(existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'modelConnectionId', existing.model_connection_id, 'modelCredentialGeneration', existing.model_credential_generation);
  END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND'; END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest OR existing.request_text IS DISTINCT FROM p_request_text THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'requestText', existing.request_text, 'createdAt', to_char(existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'modelConnectionId', existing.model_connection_id, 'modelCredentialGeneration', existing.model_credential_generation);
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN RAISE EXCEPTION 'PROJECT_BUSY'; END IF;
  SELECT admitted.connection_id, admitted.generation
  INTO selected_connection_id, selected_generation
  FROM model_connection.admit_for_project(p_account_id, p_project_id, p_provider_id) AS admitted;
  INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, trigger_message_id, idempotency_digest, request_digest, request_text, mode, base_source_revision, expected_working_version, base_working_version, model_connection_id, model_credential_generation)
  VALUES (p_builder_run_id, p_project_id, p_account_id, NULLIF(btrim(p_trigger_message_id), ''), p_idempotency_digest, p_request_digest, p_request_text, p_mode, working.working_source_revision, working.working_version, working.working_version, selected_connection_id, selected_generation)
  RETURNING * INTO existing;
  RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL, 'requestText', existing.request_text, 'createdAt', to_char(existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'modelConnectionId', existing.model_connection_id, 'modelCredentialGeneration', existing.model_credential_generation);
END;
$_$;

ALTER FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_provider_id text) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_provider_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_provider_id text) TO hub_builder_ingress;

CREATE FUNCTION builder.create_builder_run_with_model(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE created jsonb; run_id uuid; run_row builder.builder_run%ROWTYPE; credential_provider_id text;
BEGIN
  IF p_admission_id IS NULL OR p_admission_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    OR p_provider_id IS NULL OR p_provider_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    OR p_model_id IS NULL OR p_model_id !~ '\S' OR p_model_id ~ 'latest|\*' THEN
    RAISE EXCEPTION 'BUILDER_MODEL_ADMISSION_REFUSED';
  END IF;
  created := builder.create_builder_run(
    p_account_id, p_project_id, p_idempotency_digest, p_request_digest, p_request_text,
    p_trigger_message_id, p_mode, p_builder_run_id, p_provider_id
  );
  IF created->>'modelConnectionId' IS NULL OR created->>'modelCredentialGeneration' IS NULL THEN
    RAISE EXCEPTION 'MODEL_CONNECTION_REQUIRED';
  END IF;
  run_id := (created->>'builderRunId')::uuid;
  SELECT credential.provider_id INTO credential_provider_id
  FROM builder.builder_run AS run
  CROSS JOIN LATERAL model_connection.read_connection_credential(run.model_connection_id) AS credential
  WHERE run.builder_run_id = run_id;
  IF credential_provider_id IS DISTINCT FROM p_provider_id THEN
    RAISE EXCEPTION 'MODEL_CONNECTION_PROVIDER_MISMATCH';
  END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = run_id FOR UPDATE;
  IF run_row.model_admission_id IS NOT NULL AND (
    run_row.model_admission_id <> p_admission_id OR run_row.model_provider_id <> p_provider_id OR run_row.model_id <> p_model_id
  ) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  UPDATE builder.builder_run
  SET model_admission_id = p_admission_id, model_provider_id = p_provider_id, model_id = p_model_id
  WHERE builder_run_id = run_id AND model_admission_id IS NULL;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = run_id;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'state', run_row.state, 'phase', run_row.phase, 'mode', run_row.mode,
    'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', run_row.result_source_revision, 'resultKind', run_row.result_kind,
    'failureCode', run_row.failure_code, 'requestText', run_row.request_text,
    'createdAt', to_char(run_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'modelAdmissionId', run_row.model_admission_id,
    'modelProviderId', run_row.model_provider_id, 'modelId', run_row.model_id,
    'modelConnectionId', run_row.model_connection_id,
    'modelCredentialGeneration', run_row.model_credential_generation,
    'cancellationRequested', false
  );
END;
$_$;

ALTER FUNCTION builder.create_builder_run_with_model(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.create_builder_run_with_model(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.create_builder_run_with_model(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text) TO hub_builder_ingress;

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
    'state', run.state, 'phase', run.phase, 'mode', run.mode, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code, 'requestText', run.request_text,
    'createdAt', to_char(run.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'modelAdmissionId', run.model_admission_id,
    'modelProviderId', run.model_provider_id, 'modelId', run.model_id,
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
    'state', run.state, 'phase', run.phase, 'mode', run.mode, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code, 'requestText', run.request_text,
    'createdAt', to_char(run.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'modelAdmissionId', run.model_admission_id,
    'modelProviderId', run.model_provider_id, 'modelId', run.model_id,
    'cancellationRequested', COALESCE(run.cancellation_requested_at IS NOT NULL, false),
    'modelConnectionId', run.model_connection_id,
    'modelCredentialGeneration', run.model_credential_generation
  )
  FROM builder.builder_run AS run
  JOIN iam.visible_projects(p_account_id) AS visible ON visible.project_id = run.project_id
  WHERE run.project_id = p_project_id
  ORDER BY run.created_at DESC LIMIT 1;
$$;

ALTER FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid) TO hub_builder_ingress;

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
    'state', run_row.state, 'phase', run_row.phase, 'mode', run_row.mode, 'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', run_row.result_source_revision, 'resultKind', run_row.result_kind,
    'failureCode', run_row.failure_code, 'requestText', run_row.request_text,
    'createdAt', to_char(run_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'modelAdmissionId', run_row.model_admission_id,
    'modelProviderId', run_row.model_provider_id, 'modelId', run_row.model_id,
    'cancellationRequested', run_row.cancellation_requested_at IS NOT NULL
  );
END;
$$;

ALTER FUNCTION builder.request_builder_run_cancellation(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.request_builder_run_cancellation(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.request_builder_run_cancellation(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid) TO hub_builder_ingress;

COMMIT;
