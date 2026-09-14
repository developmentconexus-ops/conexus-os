BEGIN;

SET LOCAL ROLE builder_owner;

CREATE FUNCTION builder.recover_builder_runs() RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE builder.builder_run SET state = 'INTERRUPTED', failure_code = 'HUB_RESTART', finished_at = clock_timestamp()
  WHERE state IN ('QUEUED', 'RUNNING');
  RETURN QUERY SELECT builder_run_id FROM builder.builder_run WHERE state = 'QUEUED' ORDER BY created_at;
END;
$$;

ALTER FUNCTION builder.read_preview_subject(uuid, uuid, uuid) RENAME TO read_preview_subject_legacy;
CREATE FUNCTION builder.read_preview_subject(
  p_account_id uuid, p_project_id uuid, p_change_id uuid
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN legacy.value IS NULL THEN NULL ELSE legacy.value || jsonb_build_object(
    'lastPreviewArtifactRevisionId', working.last_preview_artifact_revision_id,
    'lastPreviewArtifactDigest', working.last_preview_artifact_digest
  ) END
  FROM (SELECT builder.read_preview_subject_legacy(p_account_id, p_project_id, p_change_id) AS value) AS legacy
  LEFT JOIN builder.project_working_state AS working ON working.project_id = p_project_id;
$$;

CREATE FUNCTION builder.advance_builder_run_source(
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

CREATE FUNCTION builder.settle_builder_run_build(
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

ALTER FUNCTION builder.admit_verified_application_source(uuid, uuid, uuid, text)
  RENAME TO admit_verified_application_source_legacy;

CREATE FUNCTION builder.admit_verified_application_source(
  p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run
  WHERE builder_run_id = p_execution_id AND account_id = p_account_id AND project_id = p_project_id;
  IF FOUND THEN
    RETURN run_row.state = 'RUNNING' AND run_row.mode = 'BUILD'
      AND run_row.result_source_revision = p_source_revision
      AND EXISTS (SELECT 1 FROM builder.project_working_state
        WHERE project_id = p_project_id AND working_source_revision = p_source_revision);
  END IF;
  RETURN builder.admit_verified_application_source_legacy(p_account_id, p_project_id, p_execution_id, p_source_revision);
END;
$$;

REVOKE EXECUTE ON FUNCTION builder.advance_builder_run_source(uuid,text),
  builder.settle_builder_run_build(uuid,text,uuid,text,text),
  builder.admit_verified_application_source(uuid,uuid,uuid,text), builder.recover_builder_runs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.advance_builder_run_source(uuid,text),
  builder.settle_builder_run_build(uuid,text,uuid,text,text),
  builder.admit_verified_application_source(uuid,uuid,uuid,text), builder.recover_builder_runs() TO hub_rb_executor;
GRANT EXECUTE ON FUNCTION builder.admit_verified_application_source(uuid,uuid,uuid,text) TO registry_owner;
GRANT EXECUTE ON FUNCTION builder.read_preview_subject(uuid,uuid,uuid) TO hub_rb_ingress;

RESET ROLE;
COMMIT;
