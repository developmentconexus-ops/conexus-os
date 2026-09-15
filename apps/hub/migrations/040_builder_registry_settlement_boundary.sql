BEGIN;

SET LOCAL ROLE registry_owner;

GRANT USAGE ON SCHEMA reg TO builder_owner;
GRANT EXECUTE ON FUNCTION reg.get_application_by_source(uuid, uuid, text) TO builder_owner;

RESET ROLE;

SET LOCAL ROLE builder_owner;

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
    FROM reg.get_application_by_source(run_row.account_id, run_row.project_id, p_source_revision);
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

RESET ROLE;

SET LOCAL ROLE registry_owner;

DROP FUNCTION reg.get_application_execution(uuid, uuid, uuid, text);
DROP FUNCTION reg.read_application_file_execution(uuid, uuid, uuid, text, uuid, text);

RESET ROLE;
COMMIT;
