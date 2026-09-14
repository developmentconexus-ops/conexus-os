BEGIN;

SET LOCAL ROLE builder_owner;

DROP FUNCTION IF EXISTS builder.read_preview_subject(uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS builder.read_preview_subject_legacy(uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS builder.read_preview_subject(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS builder.admit_source_revision(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS builder.admit_verified_application_source(uuid, uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS builder.admit_verified_application_source_legacy(uuid, uuid, uuid, text) CASCADE;

ALTER TABLE builder.project_working_state
  DROP COLUMN IF EXISTS working_change_id CASCADE,
  DROP COLUMN IF EXISTS working_account_id CASCADE,
  DROP COLUMN IF EXISTS current_change_id CASCADE,
  DROP COLUMN IF EXISTS current_account_id CASCADE,
  DROP COLUMN IF EXISTS preparation_attempt_id CASCADE,
  DROP COLUMN IF EXISTS last_preview_change_id CASCADE;

DROP TABLE IF EXISTS builder.finding_resolution CASCADE;
DROP TABLE IF EXISTS builder.change_acceptance CASCADE;
DROP TABLE IF EXISTS builder.verification_evidence CASCADE;
DROP TABLE IF EXISTS builder.finding CASCADE;
DROP TABLE IF EXISTS builder.contract_revision CASCADE;
DROP TABLE IF EXISTS builder.actor_run CASCADE;
DROP TABLE IF EXISTS builder.work_unit CASCADE;
DROP TABLE IF EXISTS builder.coding_session CASCADE;
DROP TABLE IF EXISTS builder.plan CASCADE;
DROP TABLE IF EXISTS builder.change CASCADE;
DROP TABLE IF EXISTS builder.operation_receipt CASCADE;

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

CREATE OR REPLACE FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'builderRunId', run.builder_run_id, 'projectId', run.project_id,
    'state', run.state, 'mode', run.mode, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code
  )
  FROM builder.builder_run AS run
  JOIN iam.admit_application_build(p_account_id, p_project_id) AS grant_row
    ON grant_row.project_id = run.project_id
  WHERE run.project_id = p_project_id
  ORDER BY run.created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION builder.claim_builder_run(
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

CREATE OR REPLACE FUNCTION builder.bind_builder_run_message(p_builder_run_id uuid, p_message_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_message_id IS NULL OR length(btrim(p_message_id)) NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
  UPDATE builder.builder_run SET trigger_message_id = btrim(p_message_id)
  WHERE builder_run_id = p_builder_run_id AND state IN ('QUEUED', 'RUNNING')
    AND (trigger_message_id IS NULL OR trigger_message_id = btrim(p_message_id));
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION builder.bind_builder_run_sandbox(p_builder_run_id uuid, p_sandbox_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_sandbox_id IS NULL OR length(btrim(p_sandbox_id)) NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
  UPDATE builder.builder_run SET sandbox_id = btrim(p_sandbox_id)
  WHERE builder_run_id = p_builder_run_id AND state = 'RUNNING'
    AND (sandbox_id IS NULL OR sandbox_id = btrim(p_sandbox_id));
  RETURN FOUND;
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

CREATE OR REPLACE FUNCTION builder.fail_builder_run(p_builder_run_id uuid, p_failure_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_failure_code IS NULL OR p_failure_code !~ '^[A-Z0-9_]{1,120}$' THEN RETURN false; END IF;
  UPDATE builder.builder_run SET state = 'FAILED', failure_code = p_failure_code,
    finished_at = clock_timestamp()
  WHERE builder_run_id = p_builder_run_id AND state IN ('QUEUED', 'RUNNING');
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION builder.recover_builder_runs() RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE builder.builder_run SET state = 'INTERRUPTED', failure_code = 'HUB_RESTART', finished_at = clock_timestamp()
  WHERE state IN ('QUEUED', 'RUNNING');
  RETURN QUERY SELECT builder_run_id FROM builder.builder_run WHERE state = 'QUEUED' ORDER BY created_at;
END;
$$;

CREATE OR REPLACE FUNCTION builder.advance_builder_run_source(
  p_builder_run_id uuid, p_source_revision text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE run_row builder.builder_run%ROWTYPE; working builder.project_working_state%ROWTYPE;
BEGIN
  IF p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN false; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'RUNNING' OR run_row.mode <> 'BUILD' THEN RETURN false; END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND OR working.working_source_revision <> run_row.base_source_revision
    OR working.working_version <> run_row.base_working_version THEN RETURN false; END IF;
  UPDATE builder.project_working_state
  SET working_source_revision = p_source_revision, working_version = working_version + 1,
      updated_at = clock_timestamp()
  WHERE project_id = run_row.project_id AND working_version = run_row.base_working_version;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE builder.builder_run SET result_source_revision = p_source_revision WHERE builder_run_id = p_builder_run_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION builder.settle_builder_run_build(
  p_builder_run_id uuid, p_source_revision text, p_artifact_revision_id uuid,
  p_artifact_digest text, p_failure_code text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE run_row builder.builder_run%ROWTYPE; working builder.project_working_state%ROWTYPE; registry_artifact record;
BEGIN
  IF p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$'
    OR (p_artifact_revision_id IS NULL) <> (p_artifact_digest IS NULL)
    OR (p_artifact_digest IS NOT NULL AND p_artifact_digest !~ '^[0-9a-f]{64}$')
    OR (p_artifact_revision_id IS NULL AND (p_failure_code IS NULL OR p_failure_code !~ '^[A-Z0-9_]{1,120}$'))
    OR (p_artifact_revision_id IS NOT NULL AND p_failure_code IS NOT NULL) THEN RETURN false; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'RUNNING' OR run_row.mode <> 'BUILD'
    OR run_row.result_source_revision IS DISTINCT FROM p_source_revision THEN RETURN false; END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND OR working.working_source_revision IS DISTINCT FROM p_source_revision THEN RETURN false; END IF;
  IF p_artifact_revision_id IS NOT NULL THEN
    SELECT artifact_revision_id, artifact_digest INTO registry_artifact
    FROM reg.get_application(run_row.account_id, run_row.project_id, p_builder_run_id, p_source_revision);
    IF NOT FOUND OR registry_artifact.artifact_revision_id IS DISTINCT FROM p_artifact_revision_id
      OR registry_artifact.artifact_digest IS DISTINCT FROM p_artifact_digest THEN RETURN false; END IF;
    UPDATE builder.project_working_state SET current_state = 'PREVIEW_READY',
      last_preview_source_revision = p_source_revision,
      last_preview_artifact_revision_id = p_artifact_revision_id,
      last_preview_artifact_digest = p_artifact_digest, updated_at = clock_timestamp()
    WHERE project_id = run_row.project_id;
    UPDATE builder.builder_run SET state = 'SUCCEEDED', result_kind = 'SOURCE_CHANGED', failure_code = NULL,
      finished_at = clock_timestamp() WHERE builder_run_id = p_builder_run_id;
  ELSE
    UPDATE builder.project_working_state SET current_state = 'BUILD_FAILED', updated_at = clock_timestamp()
    WHERE project_id = run_row.project_id;
    UPDATE builder.builder_run SET state = 'FAILED', result_kind = 'SOURCE_CHANGED_BUILD_FAILED', failure_code = p_failure_code,
      finished_at = clock_timestamp() WHERE builder_run_id = p_builder_run_id;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION builder.read_latest_code_changing_builder_run(
  p_account_id uuid,
  p_project_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  latest_code_changing builder.builder_run%ROWTYPE;
BEGIN
  PERFORM 1 FROM iam.admit_project_source_read(p_account_id, p_project_id);
  IF NOT FOUND THEN RETURN NULL; END IF;

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
    'baseSourceRevision', latest_code_changing.base_source_revision,
    'resultSourceRevision', latest_code_changing.result_source_revision,
    'resultKind', latest_code_changing.result_kind
  );
END;
$$;

CREATE FUNCTION builder.read_preview_subject(
  p_account_id uuid,
  p_project_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  working record;
BEGIN
  PERFORM 1 FROM iam.admit_project_build(p_account_id, p_project_id);
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT working_source_revision, last_preview_source_revision,
    last_preview_artifact_revision_id, last_preview_artifact_digest
  INTO working
  FROM builder.project_working_state
  WHERE project_id = p_project_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'subjectKind', 'CURRENT_PROJECT',
    'subjectDigest', working.working_source_revision,
    'sourceRevision', working.working_source_revision,
    'verified', false,
    'previewEligible', working.last_preview_source_revision = working.working_source_revision
      AND working.last_preview_artifact_revision_id IS NOT NULL
      AND working.last_preview_artifact_digest IS NOT NULL,
    'workingSourceRevision', working.working_source_revision,
    'lastPreviewSourceRevision', working.last_preview_source_revision,
    'lastPreviewArtifactRevisionId', working.last_preview_artifact_revision_id,
    'lastPreviewArtifactDigest', working.last_preview_artifact_digest
  );
END;
$$;

CREATE FUNCTION builder.admit_source_revision(
  p_account_id uuid,
  p_project_id uuid,
  p_source_revision text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  latest_code_changing record;
  current_baseline record;
BEGIN
  IF p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN false; END IF;
  PERFORM 1 FROM iam.admit_project_source_read(p_account_id, p_project_id);
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM builder.project_working_state AS working
    WHERE working.project_id = p_project_id
      AND (working.working_source_revision = p_source_revision
        OR working.last_preview_source_revision = p_source_revision)
  ) THEN RETURN true; END IF;
  SELECT run.base_source_revision, run.result_source_revision
  INTO latest_code_changing
  FROM builder.builder_run AS run
  WHERE run.project_id = p_project_id
    AND run.result_kind IN ('SOURCE_CHANGED', 'SOURCE_CHANGED_BUILD_FAILED')
    AND run.result_source_revision IS NOT NULL
  ORDER BY run.created_at DESC, run.builder_run_id DESC
  LIMIT 1;
  IF FOUND AND (latest_code_changing.base_source_revision = p_source_revision
    OR latest_code_changing.result_source_revision = p_source_revision) THEN RETURN true; END IF;
  SELECT * INTO current_baseline FROM project.get_approved_baseline(p_project_id, ARRAY[p_project_id]);
  RETURN FOUND AND current_baseline.source_revision = p_source_revision;
END;
$$;

CREATE FUNCTION builder.admit_verified_application_source(
  p_account_id uuid,
  p_project_id uuid,
  p_execution_id uuid,
  p_source_revision text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run
  WHERE builder_run_id = p_execution_id
    AND account_id = p_account_id
    AND project_id = p_project_id;
  RETURN FOUND
    AND run_row.mode = 'BUILD'
    AND run_row.result_source_revision = p_source_revision;
END;
$$;

GRANT EXECUTE ON FUNCTION builder.create_builder_run(uuid,uuid,text,text,text,text,uuid), builder.read_builder_run(uuid,uuid), builder.read_preview_subject(uuid,uuid), builder.admit_source_revision(uuid,uuid,text), builder.read_latest_code_changing_builder_run(uuid,uuid) TO hub_rb_ingress;
GRANT EXECUTE ON FUNCTION builder.claim_builder_run(uuid,text,text,text), builder.bind_builder_run_message(uuid,text), builder.bind_builder_run_sandbox(uuid,text), builder.settle_builder_run(uuid,text,text,text), builder.settle_builder_run_build(uuid,text,uuid,text,text), builder.fail_builder_run(uuid,text), builder.recover_builder_runs() TO hub_rb_executor;
GRANT EXECUTE ON FUNCTION builder.admit_verified_application_source(uuid, uuid, uuid, text) TO registry_owner;


RESET ROLE;
COMMIT;
