BEGIN;

SET LOCAL ROLE builder_owner;

CREATE FUNCTION builder.create_builder_run_with_model(
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
    'state', run_row.state, 'mode', run_row.mode, 'baseSourceRevision', run_row.base_source_revision,
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
  UPDATE builder.builder_run SET state = 'RUNNING', started_at = clock_timestamp(),
    model_admission_id = p_admission_id, model_provider_id = p_provider_id, model_id = p_model_id
  WHERE builder_run_id = p_builder_run_id AND state = 'QUEUED';
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'state', run_row.state, 'mode', run_row.mode, 'baseSourceRevision', run_row.base_source_revision,
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
    'state', run.state, 'mode', run.mode, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code, 'modelAdmissionId', run.model_admission_id,
    'modelProviderId', run.model_provider_id, 'modelId', run.model_id,
    'claudeConnectionId', run.claude_connection_id, 'claudeCredentialGeneration', run.claude_credential_generation
  )
  FROM builder.builder_run AS run
  JOIN iam.admit_application_build(p_account_id, p_project_id) AS grant_row ON grant_row.project_id = run.project_id
  WHERE run.project_id = p_project_id
  ORDER BY run.created_at DESC LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION builder.create_builder_run_with_model(uuid,uuid,text,text,text,text,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.create_builder_run_with_model(uuid,uuid,text,text,text,text,uuid,text,text,text) TO hub_rb_ingress;
REVOKE EXECUTE ON FUNCTION builder.claim_builder_run(uuid,text,text,text), builder.read_builder_run(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.claim_builder_run(uuid,text,text,text) TO hub_rb_executor;
GRANT EXECUTE ON FUNCTION builder.read_builder_run(uuid,uuid) TO hub_rb_ingress;

RESET ROLE;
COMMIT;
