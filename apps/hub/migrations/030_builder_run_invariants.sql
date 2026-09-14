BEGIN;

SET LOCAL ROLE builder_owner;

ALTER TABLE builder.project_working_state
  DROP CONSTRAINT IF EXISTS project_working_state_last_preview_check,
  DROP CONSTRAINT IF EXISTS project_working_state_last_preview_digest_check;

ALTER TABLE builder.project_working_state
  ADD CONSTRAINT project_working_state_working_source_revision_check
    CHECK (working_source_revision ~ '^[0-9a-f]{40}$'),
  ADD CONSTRAINT project_working_state_working_version_check
    CHECK (working_version >= 0),
  ADD CONSTRAINT project_working_state_current_state_check
    CHECK (current_state IN ('IDLE', 'CODING', 'PREPARING', 'PREVIEW_READY', 'BUILD_FAILED', 'RESPONDED')),
  ADD CONSTRAINT project_working_state_last_preview_source_revision_check
    CHECK (last_preview_source_revision IS NULL OR last_preview_source_revision ~ '^[0-9a-f]{40}$'),
  ADD CONSTRAINT project_working_state_last_preview_artifact_digest_check
    CHECK (last_preview_artifact_digest IS NULL OR last_preview_artifact_digest ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT project_working_state_working_pair_check
    CHECK ((working_change_id IS NULL) = (working_account_id IS NULL)),
  ADD CONSTRAINT project_working_state_current_pair_check
    CHECK ((current_change_id IS NULL) = (current_account_id IS NULL)),
  ADD CONSTRAINT project_working_state_idle_check
    CHECK ((current_state = 'IDLE') = (current_change_id IS NULL AND current_account_id IS NULL)),
  ADD CONSTRAINT project_working_state_preparation_check
    CHECK ((current_state IN ('PREPARING', 'PREVIEW_READY', 'BUILD_FAILED')) = (preparation_attempt_id IS NOT NULL)),
  ADD CONSTRAINT project_working_state_preview_coordinates_check
    CHECK ((last_preview_source_revision IS NULL) = (last_preview_artifact_revision_id IS NULL)
      AND (last_preview_source_revision IS NULL) = (last_preview_artifact_digest IS NULL));

CREATE OR REPLACE FUNCTION builder.claim_builder_run(
  p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.builder_run%ROWTYPE; working builder.project_working_state%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'QUEUED' THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  IF NOT COALESCE((SELECT true FROM iam.admit_application_build(run_row.account_id, run_row.project_id)), false) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = run_row.project_id FOR SHARE;
  IF NOT FOUND OR working.working_source_revision <> run_row.base_source_revision
    OR working.working_version <> run_row.base_working_version THEN
    RAISE EXCEPTION 'BUILDER_RUN_BASE_STALE';
  END IF;
  UPDATE builder.builder_run SET state = 'RUNNING', started_at = clock_timestamp(),
    model_admission_id = p_admission_id, model_provider_id = p_provider_id, model_id = p_model_id
  WHERE builder_run_id = p_builder_run_id;
  RETURN jsonb_build_object('builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'state', 'RUNNING', 'mode', run_row.mode, 'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION builder.settle_builder_run(
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
  IF run_row.mode = 'PLAN' AND p_result_kind <> 'RESPONSE_ONLY' THEN RETURN false; END IF;
  IF p_result_kind = 'RESPONSE_ONLY' AND (p_result_source_revision IS NOT NULL OR p_failure_code IS NOT NULL) THEN RETURN false; END IF;
  IF p_result_kind = 'SOURCE_CHANGED' AND (p_result_source_revision IS NULL OR p_failure_code IS NOT NULL) THEN RETURN false; END IF;
  IF p_result_kind = 'SOURCE_CHANGED_BUILD_FAILED' AND (p_result_source_revision IS NULL OR p_failure_code IS NULL) THEN RETURN false; END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND OR working.working_version <> run_row.base_working_version THEN RETURN false; END IF;
  IF p_result_kind IN ('SOURCE_CHANGED', 'SOURCE_CHANGED_BUILD_FAILED') THEN
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

REVOKE EXECUTE ON FUNCTION builder.claim_builder_run(uuid,text,text,text), builder.settle_builder_run(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.claim_builder_run(uuid,text,text,text), builder.settle_builder_run(uuid,text,text,text) TO hub_rb_executor;

RESET ROLE;
COMMIT;
