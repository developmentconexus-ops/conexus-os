BEGIN;

-- A run whose admitted source passed the check, and which Conexus then failed to publish, ends as its
-- own result kind. The failure is Conexus's, not the app's: the run can publish the same source
-- revision again, with no agent turn and no new commit.
ALTER TABLE builder.builder_run DROP CONSTRAINT builder_run_result_kind_check;
ALTER TABLE builder.builder_run ADD CONSTRAINT builder_run_result_kind_check CHECK (((result_kind IS NULL) OR (result_kind = ANY (ARRAY['RESPONSE_ONLY'::text, 'SOURCE_CHANGED'::text, 'SOURCE_CHANGED_BUILD_FAILED'::text, 'SOURCE_CHANGED_PUBLISH_FAILED'::text]))));
ALTER TABLE builder.project_working_state DROP CONSTRAINT project_working_state_current_state_check;
ALTER TABLE builder.project_working_state ADD CONSTRAINT project_working_state_current_state_check CHECK ((current_state = ANY (ARRAY['IDLE'::text, 'CODING'::text, 'PREPARING'::text, 'PREVIEW_READY'::text, 'BUILD_FAILED'::text, 'PUBLISH_FAILED'::text, 'RESPONDED'::text])));

-- The working state keeps the last good Preview; only its label says the publish failed.
CREATE FUNCTION builder.settle_builder_run_publish_failed(p_builder_run_id uuid, p_source_revision text, p_failure_code text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  IF p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$' OR p_failure_code IS NULL OR p_failure_code !~ '^[A-Z0-9_]{1,120}$' THEN RETURN false; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'RUNNING' OR run_row.result_source_revision IS DISTINCT FROM p_source_revision THEN RETURN false; END IF;
  PERFORM 1 FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE builder.project_working_state SET current_state = 'PUBLISH_FAILED', updated_at = clock_timestamp() WHERE project_id = run_row.project_id;
  UPDATE builder.builder_run SET state = 'FAILED', result_kind = 'SOURCE_CHANGED_PUBLISH_FAILED', failure_code = p_failure_code,
    finished_at = clock_timestamp() WHERE builder_run_id = p_builder_run_id;
  RETURN true;
END;
$_$;

-- Takes a publish-failed run back to RUNNING under this Hub so its publish runs again. Only the
-- Project's latest run qualifies, and the one-active-run index refuses it while another run works.
-- Its result kind stays until the publish settles it again.
CREATE FUNCTION builder.reopen_builder_run_publish(p_builder_run_id uuid, p_owner_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'FAILED' OR run_row.result_kind IS DISTINCT FROM 'SOURCE_CHANGED_PUBLISH_FAILED' THEN RETURN false; END IF;
  -- The publish runs as the run's account, which must still be allowed to build a Project not in deletion.
  PERFORM iam.admit_project(run_row.account_id, run_row.project_id, 'project.build');
  IF EXISTS (SELECT 1 FROM builder.builder_run AS later WHERE later.project_id = run_row.project_id
    AND later.created_at > run_row.created_at) THEN RETURN false; END IF;
  BEGIN
    UPDATE builder.builder_run SET state = 'RUNNING', phase = 'FINALIZING', failure_code = NULL, finished_at = NULL,
      cancellation_requested_at = NULL, owner_id = p_owner_id, heartbeat_at = clock_timestamp() WHERE builder_run_id = p_builder_run_id;
  EXCEPTION WHEN unique_violation THEN RETURN false;
  END;
  RETURN true;
END;
$_$;

ALTER FUNCTION builder.settle_builder_run_publish_failed(uuid, text, text) OWNER TO builder_owner;
REVOKE ALL ON FUNCTION builder.settle_builder_run_publish_failed(uuid, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.settle_builder_run_publish_failed(uuid, text, text) TO hub_builder_executor;
ALTER FUNCTION builder.reopen_builder_run_publish(uuid, uuid) OWNER TO builder_owner;
REVOKE ALL ON FUNCTION builder.reopen_builder_run_publish(uuid, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.reopen_builder_run_publish(uuid, uuid) TO hub_builder_executor;

-- Copied whole to add one result kind, and the run's account a publish retry runs as: the run reads
-- have no single SQL builder yet, and S2 removes these copies.
CREATE OR REPLACE FUNCTION builder.read_latest_code_changing_builder_run(p_account_id uuid, p_project_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  latest_code_changing builder.builder_run%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM iam.visible_projects(p_account_id) AS visible
    WHERE visible.project_id = p_project_id
  ) THEN RETURN NULL; END IF;

  SELECT run.* INTO latest_code_changing
  FROM builder.builder_run AS run
  WHERE run.project_id = p_project_id
    AND run.result_kind IN ('SOURCE_CHANGED', 'SOURCE_CHANGED_BUILD_FAILED', 'SOURCE_CHANGED_PUBLISH_FAILED')
    AND run.result_source_revision IS NOT NULL
  ORDER BY run.created_at DESC, run.builder_run_id DESC
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'builderRunId', latest_code_changing.builder_run_id,
    'projectId', latest_code_changing.project_id,
    'accountId', latest_code_changing.account_id,
    'conversationId', latest_code_changing.conversation_id,
    'baseSourceRevision', latest_code_changing.base_source_revision,
    'resultSourceRevision', latest_code_changing.result_source_revision,
    'resultKind', latest_code_changing.result_kind
  );
END;
$$;

-- Copied whole to add one result kind, for the same reason.
CREATE OR REPLACE FUNCTION builder.admit_source_revision(p_account_id uuid, p_project_id uuid, p_source_revision text, p_main_revision text) RETURNS boolean
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
    AND run.result_kind IN ('SOURCE_CHANGED', 'SOURCE_CHANGED_BUILD_FAILED', 'SOURCE_CHANGED_PUBLISH_FAILED')
    AND run.result_source_revision IS NOT NULL
  ORDER BY run.created_at DESC, run.builder_run_id DESC
  LIMIT 1;
  IF FOUND AND (latest_code_changing.base_source_revision = p_source_revision
    OR latest_code_changing.result_source_revision = p_source_revision) THEN RETURN true; END IF;
  RETURN false;
END;
$_$;

COMMIT;
