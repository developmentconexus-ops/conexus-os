BEGIN;

SET LOCAL ROLE builder_owner;

CREATE OR REPLACE FUNCTION builder.admit_source_revision(
  p_account_id uuid,
  p_project_id uuid,
  p_source_revision text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
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

  SELECT * INTO current_baseline
  FROM project.get_approved_baseline(p_project_id, ARRAY[p_project_id]);
  IF FOUND AND current_baseline.source_revision = p_source_revision THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM builder.change AS stored
    WHERE stored.project_id = p_project_id
      AND (
        stored.base_source_revision = p_source_revision OR
        stored.candidate_source_revision = p_source_revision OR
        EXISTS (
          SELECT 1 FROM builder.work_unit AS unit
          WHERE unit.change_id = stored.change_id
            AND unit.result_commit = p_source_revision
        )
      )
  );
END;
$$;

CREATE FUNCTION builder.read_latest_code_changing_builder_run(
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

REVOKE EXECUTE ON FUNCTION builder.admit_source_revision(uuid, uuid, text),
  builder.read_latest_code_changing_builder_run(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.admit_source_revision(uuid, uuid, text),
  builder.read_latest_code_changing_builder_run(uuid, uuid) TO hub_rb_ingress;

RESET ROLE;
COMMIT;
