BEGIN;

SET LOCAL ROLE builder_owner;

ALTER TABLE builder.builder_run
  ADD COLUMN IF NOT EXISTS phase text;

ALTER TABLE builder.builder_run
  DROP CONSTRAINT IF EXISTS builder_run_phase_check;

ALTER TABLE builder.builder_run
  ADD CONSTRAINT builder_run_phase_check CHECK (
    phase IS NULL
    OR (
      state = 'RUNNING'
      AND cancellation_requested_at IS NULL
      AND phase IN ('PREPARING', 'AGENT', 'SOURCE_ADMISSION', 'COMPILING', 'FINALIZING')
    )
  );

CREATE OR REPLACE FUNCTION builder.clear_builder_run_phase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.state <> 'RUNNING' OR NEW.cancellation_requested_at IS NOT NULL THEN
    NEW.phase := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS builder_run_phase_boundary ON builder.builder_run;
CREATE TRIGGER builder_run_phase_boundary
BEFORE INSERT OR UPDATE OF state, cancellation_requested_at, phase
ON builder.builder_run
FOR EACH ROW EXECUTE FUNCTION builder.clear_builder_run_phase();

CREATE OR REPLACE FUNCTION builder.set_builder_run_phase(
  p_builder_run_id uuid, p_phase text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_phase IS NULL OR p_phase NOT IN ('PREPARING', 'AGENT', 'SOURCE_ADMISSION', 'COMPILING', 'FINALIZING') THEN
    RETURN false;
  END IF;
  UPDATE builder.builder_run
  SET phase = p_phase
  WHERE builder_run_id = p_builder_run_id
    AND state = 'RUNNING'
    AND cancellation_requested_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION builder.create_builder_run(
  p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text,
  p_trigger_message_id text, p_mode text, p_builder_run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE working builder.project_working_state%ROWTYPE; existing builder.builder_run%ROWTYPE;
  selected_connection_id uuid; selected_generation bigint;
BEGIN
  PERFORM iam.ensure_project_builder_grant(p_account_id, p_project_id);
  IF NOT COALESCE((SELECT true FROM iam.admit_application_build(p_account_id, p_project_id)), false) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF p_mode NOT IN ('BUILD', 'PLAN') OR p_idempotency_digest !~ '^[0-9a-f]{64}$' OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR (p_trigger_message_id IS NOT NULL AND length(btrim(p_trigger_message_id)) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'BUILDER_RUN_INPUT_REFUSED'; END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'claudeConnectionId', existing.claude_connection_id, 'claudeCredentialGeneration', existing.claude_credential_generation);
  END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND'; END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'claudeConnectionId', existing.claude_connection_id, 'claudeCredentialGeneration', existing.claude_credential_generation);
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN RAISE EXCEPTION 'PROJECT_BUSY'; END IF;
  SELECT connection_id, generation INTO selected_connection_id, selected_generation FROM claude_connection.admit_for_project(p_account_id, p_project_id);
  INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, trigger_message_id, idempotency_digest, request_digest, mode, base_source_revision, expected_working_version, base_working_version, claude_connection_id, claude_credential_generation)
  VALUES (p_builder_run_id, p_project_id, p_account_id, NULLIF(btrim(p_trigger_message_id), ''), p_idempotency_digest, p_request_digest, p_mode, working.working_source_revision, working.working_version, working.working_version, selected_connection_id, selected_generation)
  RETURNING * INTO existing;
  RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL, 'claudeConnectionId', existing.claude_connection_id, 'claudeCredentialGeneration', existing.claude_credential_generation);
END;
$$;

CREATE OR REPLACE FUNCTION builder.create_builder_run_with_model(
  p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text,
  p_trigger_message_id text, p_mode text, p_builder_run_id uuid,
  p_admission_id text, p_provider_id text, p_model_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE created jsonb; run_id uuid; run_row builder.builder_run%ROWTYPE;
BEGIN
  IF p_admission_id IS NULL OR p_admission_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    OR p_provider_id IS NULL OR p_provider_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    OR p_model_id IS NULL OR p_model_id !~ '\S' OR p_model_id ~ 'latest|\*' THEN
    RAISE EXCEPTION 'BUILDER_MODEL_ADMISSION_REFUSED';
  END IF;
  created := builder.create_builder_run(
    p_account_id, p_project_id, p_idempotency_digest, p_request_digest,
    p_trigger_message_id, p_mode, p_builder_run_id
  );
  IF created->>'claudeConnectionId' IS NULL OR created->>'claudeCredentialGeneration' IS NULL THEN
    RAISE EXCEPTION 'CLAUDE_CONNECTION_REQUIRED';
  END IF;
  run_id := (created->>'builderRunId')::uuid;
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
    'failureCode', run_row.failure_code, 'modelAdmissionId', run_row.model_admission_id,
    'modelProviderId', run_row.model_provider_id, 'modelId', run_row.model_id,
    'claudeConnectionId', run_row.claude_connection_id,
    'claudeCredentialGeneration', run_row.claude_credential_generation,
    'cancellationRequested', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION builder.claim_builder_run(
  p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.builder_run%ROWTYPE; working builder.project_working_state%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'QUEUED' THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.admit_application_build(run_row.account_id, run_row.project_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND OR working.working_source_revision <> run_row.base_source_revision OR working.working_version <> run_row.base_working_version THEN RAISE EXCEPTION 'BUILDER_RUN_BASE_STALE'; END IF;
  IF run_row.model_admission_id IS NOT NULL AND (
    run_row.model_admission_id <> p_admission_id OR run_row.model_provider_id <> p_provider_id OR run_row.model_id <> p_model_id
  ) THEN RAISE EXCEPTION 'BUILDER_MODEL_ADMISSION_CONFLICT'; END IF;
  UPDATE builder.builder_run SET state = 'RUNNING', phase = 'PREPARING', started_at = clock_timestamp(),
    model_admission_id = p_admission_id, model_provider_id = p_provider_id, model_id = p_model_id
  WHERE builder_run_id = p_builder_run_id AND state = 'QUEUED';
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'state', run_row.state, 'phase', run_row.phase, 'mode', run_row.mode,
    'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL,
    'modelAdmissionId', run_row.model_admission_id, 'modelProviderId', run_row.model_provider_id,
    'modelId', run_row.model_id, 'claudeConnectionId', run_row.claude_connection_id,
    'claudeCredentialGeneration', run_row.claude_credential_generation,
    'cancellationRequested', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'builderRunId', run.builder_run_id, 'projectId', run.project_id,
    'state', run.state, 'phase', run.phase, 'mode', run.mode, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code, 'modelAdmissionId', run.model_admission_id,
    'modelProviderId', run.model_provider_id, 'modelId', run.model_id,
    'cancellationRequested', COALESCE(run.cancellation_requested_at IS NOT NULL, false),
    'claudeConnectionId', run.claude_connection_id,
    'claudeCredentialGeneration', run.claude_credential_generation
  )
  FROM builder.builder_run AS run
  JOIN iam.admit_application_build(p_account_id, p_project_id) AS grant_row ON grant_row.project_id = run.project_id
  WHERE run.project_id = p_project_id
  ORDER BY run.created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION builder.list_builder_runs(
  p_account_id uuid, p_project_id uuid, p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM iam.admit_application_build(p_account_id, p_project_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'builderRunId', run.builder_run_id, 'projectId', run.project_id,
    'state', run.state, 'phase', run.phase, 'mode', run.mode, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code, 'modelAdmissionId', run.model_admission_id,
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

CREATE OR REPLACE FUNCTION builder.request_builder_run_cancellation(
  p_account_id uuid, p_project_id uuid, p_builder_run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM iam.admit_application_build(p_account_id, p_project_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
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
    'failureCode', run_row.failure_code, 'modelAdmissionId', run_row.model_admission_id,
    'modelProviderId', run_row.model_provider_id, 'modelId', run_row.model_id,
    'cancellationRequested', run_row.cancellation_requested_at IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION builder.clear_builder_run_phase() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION builder.set_builder_run_phase(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.set_builder_run_phase(uuid,text) TO hub_rb_executor;

REVOKE EXECUTE ON FUNCTION builder.create_builder_run(uuid,uuid,text,text,text,text,uuid),
  builder.create_builder_run_with_model(uuid,uuid,text,text,text,text,uuid,text,text,text),
  builder.claim_builder_run(uuid,text,text,text), builder.read_builder_run(uuid,uuid),
  builder.list_builder_runs(uuid,uuid,integer), builder.request_builder_run_cancellation(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.create_builder_run(uuid,uuid,text,text,text,text,uuid),
  builder.create_builder_run_with_model(uuid,uuid,text,text,text,text,uuid,text,text,text),
  builder.read_builder_run(uuid,uuid), builder.list_builder_runs(uuid,uuid,integer),
  builder.request_builder_run_cancellation(uuid,uuid,uuid) TO hub_rb_ingress;
GRANT EXECUTE ON FUNCTION builder.claim_builder_run(uuid,text,text,text) TO hub_rb_executor;

RESET ROLE;
COMMIT;
