BEGIN;

-- A Project's source moves from its GitHub repository to its repository in the Conexus Git on the
-- Hub's own disk, and `main` there is the admitted revision. The database keeps no second copy of
-- it: it records that the repository exists, each run's base and candidate, and the Preview. The
-- Factory binding and every function that read it or a GitHub-shaped column go in this one step.

CREATE TABLE builder.project_repository (
    project_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT project_repository_pkey PRIMARY KEY (project_id),
    CONSTRAINT project_repository_project_id_fkey FOREIGN KEY (project_id) REFERENCES project.project(project_id) ON DELETE RESTRICT
);

ALTER TABLE builder.project_repository OWNER TO builder_owner;

REVOKE ALL ON TABLE builder.project_repository FROM PUBLIC;

DROP FUNCTION project.create_project_with_repository(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_name text, p_project_revision text, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_head_revision text);
DROP FUNCTION project.create_project_with_source(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_name text, p_source_mode text, p_source_revision text, p_project_revision text);
DROP FUNCTION project.plan_project_deletion(p_account_id uuid, p_project_id uuid, p_confirm_name text);
DROP FUNCTION builder.bind_factory_project(p_project_id uuid, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_head_revision text);
DROP FUNCTION builder.read_factory_binding(p_account_id uuid, p_project_id uuid);
DROP FUNCTION builder.read_factory_binding_for_project(p_project_id uuid);
DROP FUNCTION builder.read_factory_binding_for_run(p_builder_run_id uuid);
DROP FUNCTION builder.list_factory_admission_runs();
DROP FUNCTION builder.resolve_factory_project(p_account_id uuid, p_project_repository_id text);
DROP FUNCTION builder.factory_binding_document(p_binding builder.factory_binding);
DROP TABLE builder.factory_binding;
DROP FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_source_head text);
DROP FUNCTION builder.admit_source_revision(p_account_id uuid, p_project_id uuid, p_source_revision text);

ALTER TABLE project.project_deletion
    DROP COLUMN factory_project_id,
    DROP COLUMN project_repository_id,
    DROP COLUMN repository_id;

ALTER TABLE builder.project_working_state
    DROP COLUMN working_source_revision,
    DROP COLUMN working_version;

ALTER TABLE builder.builder_run
    DROP COLUMN expected_working_version,
    DROP COLUMN base_working_version;

ALTER TABLE builder.builder_run RENAME COLUMN candidate_source_revision TO candidate_revision;
ALTER TABLE builder.builder_run RENAME CONSTRAINT builder_run_candidate_source_revision_check TO builder_run_candidate_revision_check;

-- A new Project's Builder rows: its working state and the record that its repository exists. The
-- Hub has already made the repository, so a retry finds both and converges.
CREATE FUNCTION builder.register_project_repository(p_project_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO builder.project_working_state(project_id) VALUES (p_project_id) ON CONFLICT (project_id) DO NOTHING;
  INSERT INTO builder.project_repository(project_id) VALUES (p_project_id) ON CONFLICT (project_id) DO NOTHING;
END;
$$;

ALTER FUNCTION builder.register_project_repository(p_project_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.register_project_repository(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.register_project_repository(p_project_id uuid) TO project_owner;

-- A new Project is created with its repository, in one transaction, so no Project exists without
-- its repository row. The starter revision is the first `main` the Hub committed.
CREATE FUNCTION project.create_project_with_repository(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_name text, p_project_revision text, p_starter_revision text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
BEGIN
  IF p_starter_revision IS NULL OR p_starter_revision !~ '^[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'PROJECT_REPOSITORY_INPUT_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1
  FROM project.operation_idempotency AS operation_receipt
  WHERE operation_receipt.operation_id = 'PRJ-03'
    AND operation_receipt.account_id = p_account_id
    AND operation_receipt.workspace_id = p_workspace_id
    AND operation_receipt.key_digest = p_key_digest
    AND operation_receipt.request_digest = p_request_digest
    AND operation_receipt.reserved_project_id = p_project_id
    AND operation_receipt.outcome = 'RESERVED'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRJ03_RECEIPT_NOT_RESERVED' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO project.project (
    project_id, workspace_id, name, source_mode, source_revision, project_revision
  ) VALUES (
    p_project_id, p_workspace_id, p_name, 'NEW', p_starter_revision, p_project_revision
  );
  PERFORM builder.register_project_repository(p_project_id);
END;
$_$;

ALTER FUNCTION project.create_project_with_repository(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_name text, p_project_revision text, p_starter_revision text) OWNER TO project_owner;

REVOKE ALL ON FUNCTION project.create_project_with_repository(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_name text, p_project_revision text, p_starter_revision text) FROM PUBLIC;
GRANT ALL ON FUNCTION project.create_project_with_repository(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_name text, p_project_revision text, p_starter_revision text) TO hub_project_command;

-- The tombstone names only the Project: its repository path derives from the id, so deletion needs
-- nothing else to find it.
CREATE OR REPLACE FUNCTION project.begin_project_deletion(p_account_id uuid, p_project_id uuid, p_confirm_name text) RETURNS project.project_deletion
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  existing project.project_deletion%ROWTYPE;
  target project.project%ROWTYPE;
BEGIN
  IF NOT iam.is_installation_administrator(p_account_id) THEN
    RAISE EXCEPTION 'NOT_ADMITTED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO existing FROM project.project_deletion WHERE project_id = p_project_id;
  IF FOUND THEN
    IF existing.name <> p_confirm_name THEN RAISE EXCEPTION 'PROJECT_NAME_MISMATCH'; END IF;
    RETURN existing;
  END IF;
  SELECT * INTO target FROM project.project WHERE project_id = p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF target.name <> p_confirm_name THEN RAISE EXCEPTION 'PROJECT_NAME_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN
    RAISE EXCEPTION 'PROJECT_BUSY';
  END IF;
  INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by)
  VALUES (p_project_id, target.workspace_id, target.name, p_account_id)
  RETURNING * INTO existing;
  RETURN existing;
END;
$$;

CREATE OR REPLACE FUNCTION builder.purge_project(p_project_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM builder.builder_run WHERE project_id = p_project_id;
  DELETE FROM builder.project_working_state WHERE project_id = p_project_id;
  DELETE FROM builder.project_repository WHERE project_id = p_project_id;
END;
$$;

-- The one active run per Project lock: the Project's working state row, held from here to the
-- run's insert, so the Hub reads `main` as the run's base only while no other run can start or
-- settle. The Hub calls this, reads `main`, then create_builder_run, in one transaction.
CREATE FUNCTION builder.lock_project_for_run(p_account_id uuid, p_project_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  PERFORM iam.admit_project(p_account_id, p_project_id, 'project.build');
  PERFORM 1 FROM builder.project_working_state WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM builder.project_repository WHERE project_id = p_project_id) THEN
    RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND';
  END IF;
  RETURN true;
END;
$$;

ALTER FUNCTION builder.lock_project_for_run(p_account_id uuid, p_project_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.lock_project_for_run(p_account_id uuid, p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.lock_project_for_run(p_account_id uuid, p_project_id uuid) TO hub_builder_ingress;

-- The base is `main` as the Hub read it under the lock above; the database only records it.
CREATE FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_base_source_revision text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE existing builder.builder_run%ROWTYPE;
BEGIN
  PERFORM iam.admit_project(p_account_id, p_project_id, 'project.build');
  IF p_mode NOT IN ('BUILD', 'PLAN') OR p_idempotency_digest !~ '^[0-9a-f]{64}$' OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR p_conversation_id IS NULL OR length(btrim(p_conversation_id)) NOT BETWEEN 1 AND 200
    OR (p_request_text IS NOT NULL AND length(p_request_text) NOT BETWEEN 1 AND 20000)
    OR (p_trigger_message_id IS NOT NULL AND length(btrim(p_trigger_message_id)) NOT BETWEEN 1 AND 200)
    OR p_base_source_revision IS NULL OR p_base_source_revision !~ '^[0-9a-f]{40}$' THEN RAISE EXCEPTION 'BUILDER_RUN_INPUT_REFUSED'; END IF;
  PERFORM 1 FROM builder.project_working_state WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM builder.project_repository WHERE project_id = p_project_id) THEN
    RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND';
  END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest OR existing.request_text IS DISTINCT FROM p_request_text OR existing.conversation_id <> btrim(p_conversation_id) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'conversationId', existing.conversation_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'requestText', existing.request_text, 'createdAt', to_char(existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'cancellationRequested', existing.cancellation_requested_at IS NOT NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN RAISE EXCEPTION 'PROJECT_BUSY'; END IF;
  INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, trigger_message_id, idempotency_digest, request_digest, request_text, mode, base_source_revision)
  VALUES (p_builder_run_id, p_project_id, p_account_id, btrim(p_conversation_id), NULLIF(btrim(p_trigger_message_id), ''), p_idempotency_digest, p_request_digest, p_request_text, p_mode, p_base_source_revision)
  RETURNING * INTO existing;
  RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'conversationId', existing.conversation_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL, 'requestText', existing.request_text, 'createdAt', to_char(existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'cancellationRequested', false);
END;
$_$;

ALTER FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_base_source_revision text) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_base_source_revision text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_base_source_revision text) TO hub_builder_ingress;

CREATE OR REPLACE FUNCTION builder.claim_builder_run(p_builder_run_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'QUEUED' THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  PERFORM iam.admit_project(run_row.account_id, run_row.project_id, 'project.build');
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

-- The phase and the candidate move together, and only while no stop is requested, so a stopped run
-- never offers its result. A retry with the same candidate converges.
CREATE OR REPLACE FUNCTION builder.record_builder_run_candidate(p_builder_run_id uuid, p_source_revision text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
BEGIN
  IF p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN false; END IF;
  UPDATE builder.builder_run
  SET phase = 'SOURCE_ADMISSION', candidate_revision = p_source_revision
  WHERE builder_run_id = p_builder_run_id
    AND state = 'RUNNING'
    AND mode = 'BUILD'
    AND cancellation_requested_at IS NULL
    AND (candidate_revision IS NULL OR candidate_revision = p_source_revision);
  RETURN FOUND;
END;
$_$;

-- Records that `main` now holds the run's own candidate. The Hub fast forwarded `main` from the
-- run's base first, so the Conexus Git is the compare-and-swap; this row only follows it. It takes
-- the Project's lock so a new run never reads `main` between the two.
CREATE OR REPLACE FUNCTION builder.advance_builder_run_source(p_builder_run_id uuid, p_source_revision text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  IF p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN false; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'RUNNING' OR run_row.mode <> 'BUILD' THEN RETURN false; END IF;
  PERFORM 1 FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF run_row.result_source_revision = p_source_revision THEN RETURN true; END IF;
  IF run_row.result_source_revision IS NOT NULL OR run_row.candidate_revision IS DISTINCT FROM p_source_revision THEN RETURN false; END IF;
  UPDATE builder.builder_run SET result_source_revision = p_source_revision WHERE builder_run_id = p_builder_run_id;
  RETURN true;
END;
$_$;

-- A run that offered a candidate may have moved `main`, so it never settles as a response only.
CREATE OR REPLACE FUNCTION builder.settle_builder_run(p_builder_run_id uuid, p_result_source_revision text, p_result_kind text, p_failure_code text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  IF p_result_source_revision IS NOT NULL OR p_result_kind IS DISTINCT FROM 'RESPONSE_ONLY'
    OR p_failure_code IS NOT NULL THEN RETURN false; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'RUNNING' OR run_row.candidate_revision IS NOT NULL THEN RETURN false; END IF;
  UPDATE builder.builder_run SET state = 'SUCCEEDED', result_source_revision = NULL,
    result_kind = 'RESPONSE_ONLY', failure_code = NULL, finished_at = clock_timestamp()
  WHERE builder_run_id = p_builder_run_id AND state = 'RUNNING';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION builder.settle_builder_run_build(p_builder_run_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_artifact_digest text, p_failure_code text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  IF p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$'
    OR (p_artifact_revision_id IS NULL) <> (p_artifact_digest IS NULL)
    OR (p_artifact_digest IS NOT NULL AND p_artifact_digest !~ '^[0-9a-f]{64}$')
    OR (p_artifact_revision_id IS NULL AND (p_failure_code IS NULL OR p_failure_code !~ '^[A-Z0-9_]{1,120}$'))
    OR (p_artifact_revision_id IS NOT NULL AND p_failure_code IS NOT NULL) THEN RETURN false; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'RUNNING' OR run_row.mode <> 'BUILD'
    OR run_row.result_source_revision IS DISTINCT FROM p_source_revision THEN RETURN false; END IF;
  PERFORM 1 FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_artifact_revision_id IS NOT NULL THEN
    IF NOT reg.matches_application_artifact(run_row.project_id, p_source_revision, p_artifact_revision_id, p_artifact_digest) THEN
      RETURN false;
    END IF;
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
$_$;

-- The registry retains an artifact only for the running run whose recorded result it is.
CREATE OR REPLACE FUNCTION builder.admit_verified_application_source(p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM builder.builder_run AS run
    WHERE run.builder_run_id = p_execution_id
      AND run.account_id = p_account_id
      AND run.project_id = p_project_id
      AND run.state = 'RUNNING'
      AND run.mode = 'BUILD'
      AND run.result_source_revision = p_source_revision
  );
END;
$$;

-- A revision the source view may read: `main` as the Hub read it, the last Preview's, and the base
-- and result of the latest run that changed the source.
CREATE FUNCTION builder.admit_source_revision(p_account_id uuid, p_project_id uuid, p_source_revision text, p_main_revision text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE
  latest_code_changing record;
BEGIN
  IF p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM iam.visible_projects(p_account_id) AS visible
    WHERE visible.project_id = p_project_id
  ) THEN RETURN false; END IF;
  IF p_source_revision = p_main_revision THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM builder.project_working_state AS working
    WHERE working.project_id = p_project_id AND working.last_preview_source_revision = p_source_revision
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
$_$;

ALTER FUNCTION builder.admit_source_revision(p_account_id uuid, p_project_id uuid, p_source_revision text, p_main_revision text) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.admit_source_revision(p_account_id uuid, p_project_id uuid, p_source_revision text, p_main_revision text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.admit_source_revision(p_account_id uuid, p_project_id uuid, p_source_revision text, p_main_revision text) TO hub_builder_ingress;

-- The Preview a Project serves. The source it was built from is not `main` when a later build
-- failed; the Hub reads `main` itself.
CREATE OR REPLACE FUNCTION builder.read_preview_subject(p_account_id uuid, p_project_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  working record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM iam.visible_projects(p_account_id) AS visible
    WHERE visible.project_id = p_project_id
  ) THEN RETURN NULL; END IF;
  SELECT last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest
  INTO working
  FROM builder.project_working_state
  WHERE project_id = p_project_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'lastPreviewSourceRevision', working.last_preview_source_revision,
    'lastPreviewArtifactRevisionId', working.last_preview_artifact_revision_id,
    'lastPreviewArtifactDigest', working.last_preview_artifact_digest
  );
END;
$$;

-- A restart interrupts every run that had not offered a candidate; one that had may be on `main`,
-- and stays running until the Hub reads `main` and settles it.
CREATE OR REPLACE FUNCTION builder.recover_builder_runs() RETURNS SETOF uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  UPDATE builder.builder_run SET state = 'INTERRUPTED', failure_code = 'HUB_RESTART', finished_at = clock_timestamp()
  WHERE state = 'QUEUED' OR (state = 'RUNNING' AND candidate_revision IS NULL);
  RETURN QUERY SELECT builder_run_id FROM builder.builder_run WHERE state = 'QUEUED' ORDER BY created_at;
END;
$$;

CREATE FUNCTION builder.list_admission_runs() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'builderRunId', run.builder_run_id,
    'projectId', run.project_id,
    'conversationId', run.conversation_id,
    'baseSourceRevision', run.base_source_revision,
    'candidateRevision', run.candidate_revision,
    'resultSourceRevision', run.result_source_revision
  ) ORDER BY run.created_at, run.builder_run_id), '[]'::jsonb)
  FROM builder.builder_run AS run
  WHERE run.state = 'RUNNING' AND run.candidate_revision IS NOT NULL;
$$;

ALTER FUNCTION builder.list_admission_runs() OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.list_admission_runs() FROM PUBLIC;
GRANT ALL ON FUNCTION builder.list_admission_runs() TO hub_builder_executor;

COMMIT;
