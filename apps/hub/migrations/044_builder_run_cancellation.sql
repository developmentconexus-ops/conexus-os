BEGIN;

SET LOCAL ROLE builder_owner;

ALTER TABLE builder.builder_run
  ADD COLUMN cancellation_requested_at timestamptz,
  ADD COLUMN cancellation_reason text;

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
    'state', run_row.state, 'mode', run_row.mode, 'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', run_row.result_source_revision, 'resultKind', run_row.result_kind,
    'failureCode', run_row.failure_code, 'modelAdmissionId', run_row.model_admission_id,
    'modelProviderId', run_row.model_provider_id, 'modelId', run_row.model_id,
    'cancellationRequested', run_row.cancellation_requested_at IS NOT NULL
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
    'cancellationRequested', COALESCE(run.cancellation_requested_at IS NOT NULL, false),
    'claudeConnectionId', run.claude_connection_id,
    'claudeCredentialGeneration', run.claude_credential_generation
  )
  FROM builder.builder_run AS run
  JOIN iam.admit_application_build(p_account_id, p_project_id) AS grant_row ON grant_row.project_id = run.project_id
  WHERE run.project_id = p_project_id
  ORDER BY run.created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION builder.interrupt_builder_run(p_builder_run_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_reason IS NULL OR p_reason !~ '^[A-Z0-9_]{1,120}$' THEN RETURN false; END IF;
  UPDATE builder.builder_run
  SET state = 'INTERRUPTED', failure_code = p_reason,
    cancellation_requested_at = COALESCE(cancellation_requested_at, clock_timestamp()),
    cancellation_reason = COALESCE(cancellation_reason, p_reason), finished_at = clock_timestamp()
  WHERE builder_run_id = p_builder_run_id AND state IN ('QUEUED', 'RUNNING');
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION builder.request_builder_run_cancellation(uuid,uuid,uuid), builder.interrupt_builder_run(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.request_builder_run_cancellation(uuid,uuid,uuid) TO hub_rb_ingress;
GRANT EXECUTE ON FUNCTION builder.interrupt_builder_run(uuid,text) TO hub_rb_executor;

RESET ROLE;
COMMIT;
