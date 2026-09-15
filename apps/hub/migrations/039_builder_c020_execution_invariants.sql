BEGIN;

SET LOCAL ROLE builder_owner;

CREATE OR REPLACE FUNCTION builder.claim_builder_run(
  p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.builder_run%ROWTYPE; grant_row record; working builder.project_working_state%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'QUEUED' THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  SELECT * INTO grant_row FROM iam.admit_application_build(run_row.account_id, run_row.project_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND OR working.working_source_revision <> run_row.base_source_revision
    OR working.working_version <> run_row.base_working_version THEN
    RAISE EXCEPTION 'BUILDER_RUN_BASE_STALE';
  END IF;
  UPDATE builder.builder_run SET state = 'RUNNING', started_at = clock_timestamp(),
    model_admission_id = p_admission_id, model_provider_id = p_provider_id, model_id = p_model_id
  WHERE builder_run_id = p_builder_run_id AND state = 'QUEUED';
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'state', 'RUNNING', 'mode', run_row.mode, 'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION builder.settle_builder_run(
  p_builder_run_id uuid, p_result_source_revision text, p_result_kind text, p_failure_code text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.builder_run%ROWTYPE; working builder.project_working_state%ROWTYPE;
BEGIN
  IF p_result_source_revision IS NOT NULL OR p_result_kind IS DISTINCT FROM 'RESPONSE_ONLY'
    OR p_failure_code IS NOT NULL THEN RETURN false; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'RUNNING' THEN RETURN false; END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND OR working.working_version <> run_row.base_working_version THEN RETURN false; END IF;
  UPDATE builder.builder_run SET state = 'SUCCEEDED', result_source_revision = NULL,
    result_kind = 'RESPONSE_ONLY', failure_code = NULL, finished_at = clock_timestamp()
  WHERE builder_run_id = p_builder_run_id AND state = 'RUNNING';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION builder.admit_verified_application_source(
  p_account_id uuid,
  p_project_id uuid,
  p_execution_id uuid,
  p_source_revision text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM builder.builder_run AS run
    JOIN builder.project_working_state AS working ON working.project_id = run.project_id
    WHERE run.builder_run_id = p_execution_id
      AND run.account_id = p_account_id
      AND run.project_id = p_project_id
      AND run.state = 'RUNNING'
      AND run.mode = 'BUILD'
      AND run.result_source_revision = p_source_revision
      AND working.working_source_revision = p_source_revision
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION builder.claim_builder_run(uuid,text,text,text),
  builder.settle_builder_run(uuid,text,text,text),
  builder.admit_verified_application_source(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.claim_builder_run(uuid,text,text,text),
  builder.settle_builder_run(uuid,text,text,text) TO hub_rb_executor;
GRANT EXECUTE ON FUNCTION builder.admit_verified_application_source(uuid,uuid,uuid,text) TO registry_owner;

RESET ROLE;
COMMIT;
