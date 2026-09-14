BEGIN;

SET LOCAL ROLE builder_owner;

CREATE OR REPLACE FUNCTION builder.create_builder_run(
  p_account_id uuid,
  p_project_id uuid,
  p_idempotency_digest text,
  p_request_digest text,
  p_trigger_message_id text,
  p_mode text,
  p_builder_run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  working builder.project_working_state%ROWTYPE;
  existing builder.builder_run%ROWTYPE;
  admitted builder.builder_run%ROWTYPE;
BEGIN
  PERFORM iam.ensure_project_builder_grant(p_account_id, p_project_id);
  IF NOT COALESCE((SELECT true FROM iam.admit_application_build(p_account_id, p_project_id)), false) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF p_mode NOT IN ('BUILD', 'PLAN')
    OR p_idempotency_digest !~ '^[0-9a-f]{64}$'
    OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR (p_trigger_message_id IS NOT NULL AND length(btrim(p_trigger_message_id)) NOT BETWEEN 1 AND 200) THEN
    RAISE EXCEPTION 'BUILDER_RUN_INPUT_REFUSED';
  END IF;

  SELECT * INTO existing FROM builder.builder_run
  WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'builderRunId', existing.builder_run_id, 'projectId', existing.project_id,
      'state', existing.state, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision,
      'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind,
      'failureCode', existing.failure_code
    );
  END IF;

  SELECT * INTO working FROM builder.project_working_state
  WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND'; END IF;
  SELECT * INTO existing FROM builder.builder_run
  WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'builderRunId', existing.builder_run_id, 'projectId', existing.project_id,
      'state', existing.state, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision,
      'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind,
      'failureCode', existing.failure_code
    );
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN
    RAISE EXCEPTION 'PROJECT_BUSY';
  END IF;

  INSERT INTO builder.builder_run(
    builder_run_id, project_id, account_id, trigger_message_id, idempotency_digest, request_digest,
    mode, base_source_revision, expected_working_version, base_working_version
  ) VALUES (
    p_builder_run_id, p_project_id, p_account_id, NULLIF(btrim(p_trigger_message_id), ''),
    p_idempotency_digest, p_request_digest, p_mode, working.working_source_revision,
    working.working_version, working.working_version
  ) RETURNING * INTO admitted;
  RETURN jsonb_build_object(
    'builderRunId', admitted.builder_run_id, 'projectId', admitted.project_id,
    'state', admitted.state, 'mode', admitted.mode, 'baseSourceRevision', admitted.base_source_revision,
    'resultSourceRevision', admitted.result_source_revision, 'resultKind', admitted.result_kind,
    'failureCode', admitted.failure_code
  );
END;
$$;

RESET ROLE;
COMMIT;
