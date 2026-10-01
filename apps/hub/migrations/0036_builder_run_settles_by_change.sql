BEGIN;

-- A run settles by what it changed, not by the mode it started in (spec 0002 AC-4): a run that
-- starts in Planejar builds in the same run once the person approves its plan. Planejar's
-- read-only rule is the tool guard's, on every call; these four functions stop requiring
-- mode = 'BUILD' and keep every other check. builder_run.mode stays the mode at the start.

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
    AND cancellation_requested_at IS NULL
    AND (candidate_revision IS NULL OR candidate_revision = p_source_revision);
  RETURN FOUND;
END;
$_$;

CREATE OR REPLACE FUNCTION builder.advance_builder_run_source(p_builder_run_id uuid, p_source_revision text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  IF p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN false; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'RUNNING' THEN RETURN false; END IF;
  PERFORM 1 FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF run_row.result_source_revision = p_source_revision THEN RETURN true; END IF;
  IF run_row.result_source_revision IS NOT NULL OR run_row.candidate_revision IS DISTINCT FROM p_source_revision THEN RETURN false; END IF;
  UPDATE builder.builder_run SET result_source_revision = p_source_revision WHERE builder_run_id = p_builder_run_id;
  RETURN true;
END;
$_$;

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
  IF NOT FOUND OR run_row.state <> 'RUNNING'
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
      AND run.result_source_revision = p_source_revision
  );
END;
$$;

COMMIT;
