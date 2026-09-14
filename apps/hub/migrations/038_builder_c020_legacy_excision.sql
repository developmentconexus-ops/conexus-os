BEGIN;

SET LOCAL ROLE builder_owner;

SET LOCAL ROLE registry_owner;
DROP FUNCTION IF EXISTS reg.retain_application(uuid, uuid, uuid, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS reg.get_application(uuid, uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS reg.read_application_file(uuid, uuid, uuid, text, uuid, text) CASCADE;
SET LOCAL ROLE project_owner;
DROP FUNCTION IF EXISTS project.lock_application_baseline(uuid) CASCADE;
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
    FROM reg.get_application_execution(run_row.account_id, run_row.project_id, p_builder_run_id, p_source_revision);
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
  RETURN false;
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



SET LOCAL ROLE registry_owner;

CREATE OR REPLACE FUNCTION reg.retain_application_execution(
  p_account_id uuid,
  p_project_id uuid,
  p_execution_id uuid,
  p_source_revision text,
  p_payload jsonb
) RETURNS TABLE(
  artifact_revision_id uuid,
  artifact_digest text,
  project_id uuid,
  source_revision text,
  profile text,
  template_ref text,
  recipe_sha256 text,
  entry_path text,
  files jsonb
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  artifact_row reg.artifact%ROWTYPE;
  revision_row reg.artifact_revision%ROWTYPE;
  item jsonb;
  computed_digest text;
  expected_media_type text;
  decoded_bytes bytea;
  previous_path text;
  total_bytes bigint := 0;
  item_count integer;
BEGIN
  IF p_account_id IS NULL OR p_project_id IS NULL OR p_execution_id IS NULL OR p_source_revision IS NULL
    OR p_source_revision !~ '^[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'APPLICATION_INPUT_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT COALESCE(builder.admit_verified_application_source(
    p_account_id, p_project_id, p_execution_id, p_source_revision
  ), false) THEN
    RAISE EXCEPTION 'APPLICATION_SUBJECT_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_payload)) <> 8
    OR NOT (p_payload ? 'format') OR NOT (p_payload ? 'profile')
    OR NOT (p_payload ? 'projectId') OR NOT (p_payload ? 'sourceRevision')
    OR NOT (p_payload ? 'templateRef') OR NOT (p_payload ? 'recipeSha256')
    OR NOT (p_payload ? 'entryPath') OR NOT (p_payload ? 'files') THEN
    RAISE EXCEPTION 'APPLICATION_PAYLOAD_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_payload->'format') IS DISTINCT FROM 'string'
    OR p_payload->>'format' IS DISTINCT FROM 'application-payload-v1'
    OR jsonb_typeof(p_payload->'profile') IS DISTINCT FROM 'string'
    OR p_payload->>'profile' IS DISTINCT FROM 'REACT_VITE_V1'
    OR jsonb_typeof(p_payload->'projectId') IS DISTINCT FROM 'string'
    OR p_payload->>'projectId' IS DISTINCT FROM p_project_id::text
    OR jsonb_typeof(p_payload->'sourceRevision') IS DISTINCT FROM 'string'
    OR p_payload->>'sourceRevision' IS DISTINCT FROM p_source_revision
    OR jsonb_typeof(p_payload->'templateRef') IS DISTINCT FROM 'string'
    OR p_payload->>'templateRef' IS DISTINCT FROM 'xdli9puqp1nepk4ht6lw:8a1e3885-c6d7-4b06-aea6-860632f407e6'
    OR jsonb_typeof(p_payload->'recipeSha256') IS DISTINCT FROM 'string'
    OR p_payload->>'recipeSha256' IS DISTINCT FROM '32230b4ba0b72625474b7f722e2294a256f9ab2f7c1c9b1eb107f38770edbe97'
    OR jsonb_typeof(p_payload->'entryPath') IS DISTINCT FROM 'string'
    OR p_payload->>'entryPath' IS DISTINCT FROM 'index.html'
    OR jsonb_typeof(p_payload->'files') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'APPLICATION_PAYLOAD_PIN_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  item_count := jsonb_array_length(p_payload->'files');
  IF item_count < 1 OR item_count > 256 THEN
    RAISE EXCEPTION 'APPLICATION_FILE_COUNT_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'files') WITH ORDINALITY AS elements(value, position)
  LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(item)) <> 5
      OR NOT (item ? 'path') OR NOT (item ? 'mediaType') OR NOT (item ? 'byteLength')
      OR NOT (item ? 'sha256') OR NOT (item ? 'base64')
      OR jsonb_typeof(item->'path') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'mediaType') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'byteLength') IS DISTINCT FROM 'number'
      OR jsonb_typeof(item->'sha256') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'base64') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'APPLICATION_FILE_SHAPE_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    IF length(item->>'path') < 1 OR length(item->>'path') > 1024
      OR item->>'path' !~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$'
      OR (item->>'path') COLLATE "C" <= (COALESCE(previous_path, '')) COLLATE "C" THEN
      RAISE EXCEPTION 'APPLICATION_FILE_PATH_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    previous_path := item->>'path';
    IF item->>'path' = 'index.html' AND item->>'mediaType' <> 'text/html; charset=utf-8' THEN
      RAISE EXCEPTION 'APPLICATION_ENTRYPOINT_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    expected_media_type := CASE lower(regexp_replace(item->>'path', '^.*(\.[^./]*)$', '\1'))
      WHEN '.avif' THEN 'image/avif'
      WHEN '.cjs' THEN 'text/javascript; charset=utf-8'
      WHEN '.css' THEN 'text/css; charset=utf-8'
      WHEN '.gif' THEN 'image/gif'
      WHEN '.html' THEN 'text/html; charset=utf-8'
      WHEN '.ico' THEN 'image/x-icon'
      WHEN '.jpeg' THEN 'image/jpeg'
      WHEN '.jpg' THEN 'image/jpeg'
      WHEN '.js' THEN 'text/javascript; charset=utf-8'
      WHEN '.json' THEN 'application/json; charset=utf-8'
      WHEN '.mjs' THEN 'text/javascript; charset=utf-8'
      WHEN '.otf' THEN 'font/otf'
      WHEN '.png' THEN 'image/png'
      WHEN '.svg' THEN 'image/svg+xml'
      WHEN '.txt' THEN 'text/plain; charset=utf-8'
      WHEN '.wasm' THEN 'application/wasm'
      WHEN '.webp' THEN 'image/webp'
      WHEN '.woff' THEN 'font/woff'
      WHEN '.woff2' THEN 'font/woff2'
      ELSE NULL
    END;
    IF expected_media_type IS NULL OR item->>'mediaType' IS DISTINCT FROM expected_media_type THEN
      RAISE EXCEPTION 'APPLICATION_MEDIA_TYPE_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    IF item->>'byteLength' !~ '^[0-9]+$' OR length(item->>'byteLength') > 8
      OR (item->>'byteLength')::bigint > 12582912 THEN
      RAISE EXCEPTION 'APPLICATION_FILE_SIZE_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    IF item->>'sha256' !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'APPLICATION_FILE_HASH_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    IF length(item->>'base64') > 16777216
      OR length(item->>'base64') <> ((((item->>'byteLength')::bigint + 2) / 3) * 4)::integer THEN
      RAISE EXCEPTION 'APPLICATION_FILE_ENCODING_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    decoded_bytes := decode(item->>'base64', 'base64');
    IF item->>'base64' <> regexp_replace(encode(decoded_bytes, 'base64'), E'[\r\n]', '', 'g')
      OR octet_length(decoded_bytes) <> (item->>'byteLength')::bigint
      OR encode(sha256(decoded_bytes), 'hex') IS DISTINCT FROM item->>'sha256' THEN
      RAISE EXCEPTION 'APPLICATION_FILE_ENCODING_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    total_bytes := total_bytes + octet_length(decoded_bytes);
    IF total_bytes > 12582912 THEN
      RAISE EXCEPTION 'APPLICATION_TOTAL_SIZE_REFUSED' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  IF previous_path IS DISTINCT FROM (SELECT value->>'path' FROM jsonb_array_elements(p_payload->'files') AS values(value)
    ORDER BY value->>'path' COLLATE "C" DESC LIMIT 1)
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'files') AS values(value) WHERE value->>'path' = 'index.html') THEN
    RAISE EXCEPTION 'APPLICATION_FILE_ORDER_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(DISTINCT value->>'path') FROM jsonb_array_elements(p_payload->'files') AS values(value)) <> item_count THEN
    RAISE EXCEPTION 'APPLICATION_FILE_DUPLICATE_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  computed_digest := encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
  INSERT INTO reg.artifact(artifact_id, workspace_id, project_id, kind, semantic_name)
  VALUES (gen_random_uuid(), NULL, p_project_id, 'application', 'Project Application')
  ON CONFLICT ON CONSTRAINT artifact_project_id_kind_key DO NOTHING;

  SELECT * INTO STRICT artifact_row
  FROM reg.artifact AS stored_artifact
  WHERE stored_artifact.project_id = p_project_id
    AND stored_artifact.kind = 'application'
  FOR UPDATE;

  INSERT INTO reg.artifact_revision(
    artifact_revision_id, artifact_id, source_revision, digest, payload, availability
  ) VALUES (
    gen_random_uuid(), artifact_row.artifact_id, p_source_revision, computed_digest, p_payload, 'AVAILABLE'
  ) ON CONFLICT ON CONSTRAINT artifact_revision_artifact_id_source_revision_key DO NOTHING;

  SELECT * INTO STRICT revision_row
  FROM reg.artifact_revision AS stored_revision
  WHERE stored_revision.artifact_id = artifact_row.artifact_id
    AND stored_revision.source_revision = p_source_revision
  FOR SHARE;

  IF revision_row.digest IS DISTINCT FROM computed_digest OR revision_row.payload IS DISTINCT FROM p_payload
    OR revision_row.availability IS DISTINCT FROM 'AVAILABLE' THEN
    RAISE EXCEPTION 'APPLICATION_IDENTITY_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT revision_row.artifact_revision_id, revision_row.digest, artifact_row.project_id,
    revision_row.source_revision, revision_row.payload->>'profile', revision_row.payload->>'templateRef',
    revision_row.payload->>'recipeSha256', revision_row.payload->>'entryPath',
    (SELECT jsonb_agg(jsonb_build_object(
      'path', value->>'path', 'mediaType', value->>'mediaType',
      'byteLength', (value->>'byteLength')::integer, 'sha256', value->>'sha256'
    ) ORDER BY value->>'path' COLLATE "C") FROM jsonb_array_elements(revision_row.payload->'files') AS values(value));
END;
$$;

CREATE OR REPLACE FUNCTION reg.get_application_execution(
  p_account_id uuid,
  p_project_id uuid,
  p_execution_id uuid,
  p_source_revision text
) RETURNS TABLE(
  artifact_revision_id uuid,
  artifact_digest text,
  project_id uuid,
  source_revision text,
  profile text,
  template_ref text,
  recipe_sha256 text,
  entry_path text,
  files jsonb
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  revision_row reg.artifact_revision%ROWTYPE;
  artifact_row reg.artifact%ROWTYPE;
BEGIN
  IF NOT COALESCE(builder.admit_verified_application_source(
    p_account_id, p_project_id, p_execution_id, p_source_revision
  ), false) THEN
    RAISE EXCEPTION 'APPLICATION_SUBJECT_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  SELECT artifact.* INTO STRICT artifact_row
  FROM reg.artifact AS artifact
  WHERE artifact.project_id = p_project_id AND artifact.kind = 'application';
  SELECT revision.* INTO STRICT revision_row
  FROM reg.artifact_revision AS revision
  WHERE revision.artifact_id = artifact_row.artifact_id
    AND revision.source_revision = p_source_revision
    AND revision.availability = 'AVAILABLE';
  RETURN QUERY SELECT revision_row.artifact_revision_id, revision_row.digest, artifact_row.project_id,
    revision_row.source_revision, revision_row.payload->>'profile', revision_row.payload->>'templateRef',
    revision_row.payload->>'recipeSha256', revision_row.payload->>'entryPath',
    (SELECT jsonb_agg(jsonb_build_object(
      'path', value->>'path', 'mediaType', value->>'mediaType',
      'byteLength', (value->>'byteLength')::integer, 'sha256', value->>'sha256'
    ) ORDER BY value->>'path' COLLATE "C") FROM jsonb_array_elements(revision_row.payload->'files') AS values(value));
EXCEPTION WHEN no_data_found THEN
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION reg.read_application_file_execution(
  p_account_id uuid,
  p_project_id uuid,
  p_execution_id uuid,
  p_source_revision text,
  p_artifact_revision_id uuid,
  p_path text
) RETURNS TABLE(
  artifact_revision_id uuid,
  project_id uuid,
  source_revision text,
  path text,
  media_type text,
  bytes bytea,
  sha256 text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  revision_row reg.artifact_revision%ROWTYPE;
  artifact_row reg.artifact%ROWTYPE;
  file_row jsonb;
BEGIN
  IF NOT COALESCE(builder.admit_verified_application_source(
    p_account_id, p_project_id, p_execution_id, p_source_revision
  ), false) THEN
    RAISE EXCEPTION 'APPLICATION_SUBJECT_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  SELECT artifact.* INTO STRICT artifact_row
  FROM reg.artifact AS artifact
  WHERE artifact.project_id = p_project_id AND artifact.kind = 'application';
  SELECT revision.* INTO STRICT revision_row
  FROM reg.artifact_revision AS revision
  WHERE revision.artifact_id = artifact_row.artifact_id
    AND revision.artifact_revision_id = p_artifact_revision_id
    AND revision.source_revision = p_source_revision
    AND revision.availability = 'AVAILABLE';
  SELECT value INTO STRICT file_row
  FROM jsonb_array_elements(revision_row.payload->'files') AS values(value)
  WHERE value->>'path' = p_path;
  RETURN QUERY SELECT revision_row.artifact_revision_id, artifact_row.project_id,
    revision_row.source_revision, file_row->>'path', file_row->>'mediaType',
    decode(file_row->>'base64', 'base64'), file_row->>'sha256';
EXCEPTION WHEN no_data_found THEN
  RETURN;
END;
$$;

SET LOCAL ROLE builder_owner;

GRANT EXECUTE ON FUNCTION builder.create_builder_run(uuid,uuid,text,text,text,text,uuid), builder.read_builder_run(uuid,uuid), builder.read_preview_subject(uuid,uuid), builder.admit_source_revision(uuid,uuid,text), builder.read_latest_code_changing_builder_run(uuid,uuid) TO hub_rb_ingress;
GRANT EXECUTE ON FUNCTION builder.claim_builder_run(uuid,text,text,text), builder.bind_builder_run_message(uuid,text), builder.bind_builder_run_sandbox(uuid,text), builder.settle_builder_run(uuid,text,text,text), builder.settle_builder_run_build(uuid,text,uuid,text,text), builder.fail_builder_run(uuid,text), builder.recover_builder_runs() TO hub_rb_executor;
GRANT EXECUTE ON FUNCTION builder.admit_verified_application_source(uuid, uuid, uuid, text) TO registry_owner;
RESET ROLE;
GRANT USAGE ON SCHEMA iam TO registry_owner;
GRANT EXECUTE ON FUNCTION iam.admit_application_build(uuid, uuid) TO registry_owner;
SET LOCAL ROLE builder_owner;


RESET ROLE;
COMMIT;
