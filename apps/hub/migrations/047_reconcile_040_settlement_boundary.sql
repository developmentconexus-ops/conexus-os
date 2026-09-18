BEGIN;

SET LOCAL ROLE registry_owner;

CREATE OR REPLACE FUNCTION reg.matches_application_artifact(
  p_project_id uuid,
  p_source_revision text,
  p_artifact_revision_id uuid,
  p_artifact_digest text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM reg.artifact AS artifact
    JOIN reg.artifact_revision AS revision ON revision.artifact_id = artifact.artifact_id
    WHERE artifact.project_id = p_project_id
      AND artifact.kind = 'application'
      AND revision.source_revision = p_source_revision
      AND revision.artifact_revision_id = p_artifact_revision_id
      AND revision.digest = p_artifact_digest
      AND revision.availability = 'AVAILABLE'
  );
$$;

REVOKE EXECUTE ON FUNCTION reg.matches_application_artifact(uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reg.matches_application_artifact(uuid, text, uuid, text) TO builder_owner;
REVOKE EXECUTE ON FUNCTION reg.get_application_by_source(uuid, uuid, text) FROM builder_owner;

RESET ROLE;

SET LOCAL ROLE builder_owner;

CREATE OR REPLACE FUNCTION builder.settle_builder_run_build(
  p_builder_run_id uuid, p_source_revision text, p_artifact_revision_id uuid,
  p_artifact_digest text, p_failure_code text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE run_row builder.builder_run%ROWTYPE; working builder.project_working_state%ROWTYPE;
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
$$;

RESET ROLE;
COMMIT;
