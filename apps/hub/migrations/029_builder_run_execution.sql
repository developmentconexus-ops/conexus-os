BEGIN;

SET LOCAL ROLE builder_owner;

ALTER TABLE builder.builder_run
  ADD COLUMN request_digest text,
  ADD COLUMN base_working_version bigint,
  ADD COLUMN model_admission_id text,
  ADD COLUMN model_provider_id text,
  ADD COLUMN model_id text;

UPDATE builder.builder_run
SET request_digest = idempotency_digest,
    base_working_version = expected_working_version
WHERE request_digest IS NULL OR base_working_version IS NULL;

ALTER TABLE builder.builder_run
  ALTER COLUMN request_digest SET NOT NULL,
  ALTER COLUMN base_working_version SET NOT NULL,
  ADD CONSTRAINT builder_run_request_digest_check CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT builder_run_base_working_version_check CHECK (base_working_version >= 0);

ALTER TABLE builder.builder_run
  ALTER COLUMN trigger_message_id DROP NOT NULL;

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'builder.project_working_state'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE builder.project_working_state DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END;
$$;

ALTER TABLE builder.project_working_state
  ADD CONSTRAINT project_working_state_last_preview_check CHECK (
    (last_preview_change_id IS NULL) = (last_preview_source_revision IS NULL
      AND last_preview_artifact_revision_id IS NULL AND last_preview_artifact_digest IS NULL)
  ),
  ADD CONSTRAINT project_working_state_last_preview_digest_check CHECK (
    last_preview_artifact_digest IS NULL OR last_preview_artifact_digest ~ '^[0-9a-f]{64}$'
  );

DROP FUNCTION builder.create_builder_run(uuid, uuid, text, text, text, text, uuid);

CREATE FUNCTION builder.create_builder_run(
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

CREATE FUNCTION builder.claim_builder_run(
  p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'QUEUED' THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  UPDATE builder.builder_run SET state = 'RUNNING', started_at = clock_timestamp(),
    model_admission_id = p_admission_id, model_provider_id = p_provider_id, model_id = p_model_id
  WHERE builder_run_id = p_builder_run_id;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'state', 'RUNNING', 'mode', run_row.mode, 'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL
  );
END;
$$;

CREATE FUNCTION builder.bind_builder_run_message(p_builder_run_id uuid, p_message_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_message_id IS NULL OR length(btrim(p_message_id)) NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
  UPDATE builder.builder_run SET trigger_message_id = btrim(p_message_id)
  WHERE builder_run_id = p_builder_run_id AND state IN ('QUEUED', 'RUNNING')
    AND (trigger_message_id IS NULL OR trigger_message_id = btrim(p_message_id));
  RETURN FOUND;
END;
$$;

CREATE FUNCTION builder.bind_builder_run_sandbox(p_builder_run_id uuid, p_sandbox_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_sandbox_id IS NULL OR length(btrim(p_sandbox_id)) NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
  UPDATE builder.builder_run SET sandbox_id = btrim(p_sandbox_id)
  WHERE builder_run_id = p_builder_run_id AND state = 'RUNNING'
    AND (sandbox_id IS NULL OR sandbox_id = btrim(p_sandbox_id));
  RETURN FOUND;
END;
$$;

CREATE FUNCTION builder.settle_builder_run(
  p_builder_run_id uuid, p_result_source_revision text, p_result_kind text, p_failure_code text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.builder_run%ROWTYPE; working builder.project_working_state%ROWTYPE;
BEGIN
  IF p_result_kind NOT IN ('RESPONSE_ONLY', 'SOURCE_CHANGED', 'SOURCE_CHANGED_BUILD_FAILED')
    OR (p_result_source_revision IS NOT NULL AND p_result_source_revision !~ '^[0-9a-f]{40}$')
    OR (p_failure_code IS NOT NULL AND p_failure_code !~ '^[A-Z0-9_]{1,120}$') THEN RETURN false; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'RUNNING' THEN RETURN false; END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND OR working.working_version <> run_row.base_working_version THEN RETURN false; END IF;
  IF p_result_kind = 'SOURCE_CHANGED' OR p_result_kind = 'SOURCE_CHANGED_BUILD_FAILED' THEN
    IF p_result_source_revision IS NULL THEN RETURN false; END IF;
    UPDATE builder.project_working_state SET working_source_revision = p_result_source_revision,
      working_version = working_version + 1, updated_at = clock_timestamp()
    WHERE project_id = run_row.project_id AND working_version = run_row.base_working_version;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  UPDATE builder.builder_run SET state = CASE WHEN p_result_kind = 'SOURCE_CHANGED_BUILD_FAILED' THEN 'FAILED' ELSE 'SUCCEEDED' END,
    result_source_revision = p_result_source_revision, result_kind = p_result_kind,
    failure_code = p_failure_code, finished_at = clock_timestamp()
  WHERE builder_run_id = p_builder_run_id AND state = 'RUNNING';
  RETURN FOUND;
END;
$$;

CREATE FUNCTION builder.fail_builder_run(p_builder_run_id uuid, p_failure_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_failure_code IS NULL OR p_failure_code !~ '^[A-Z0-9_]{1,120}$' THEN RETURN false; END IF;
  UPDATE builder.builder_run SET state = 'FAILED', failure_code = p_failure_code,
    finished_at = clock_timestamp()
  WHERE builder_run_id = p_builder_run_id AND state IN ('QUEUED', 'RUNNING');
  RETURN FOUND;
END;
$$;

REVOKE ALL ON TABLE builder.builder_run FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION builder.create_builder_run(uuid,uuid,text,text,text,text,uuid),
  builder.claim_builder_run(uuid,text,text,text), builder.bind_builder_run_message(uuid,text),
  builder.bind_builder_run_sandbox(uuid,text), builder.settle_builder_run(uuid,text,text,text),
  builder.fail_builder_run(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.create_builder_run(uuid,uuid,text,text,text,text,uuid) TO hub_rb_ingress;
GRANT EXECUTE ON FUNCTION builder.claim_builder_run(uuid,text,text,text),
  builder.bind_builder_run_message(uuid,text), builder.bind_builder_run_sandbox(uuid,text),
  builder.settle_builder_run(uuid,text,text,text), builder.fail_builder_run(uuid,text) TO hub_rb_executor;

RESET ROLE;
COMMIT;
