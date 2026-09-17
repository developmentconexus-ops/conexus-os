BEGIN;

SET LOCAL ROLE builder_owner;

CREATE OR REPLACE FUNCTION builder.list_builder_runs(
  p_account_id uuid, p_project_id uuid, p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM iam.admit_application_build(p_account_id, p_project_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'builderRunId', run.builder_run_id, 'projectId', run.project_id,
    'state', run.state, 'mode', run.mode, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code, 'modelAdmissionId', run.model_admission_id,
    'modelProviderId', run.model_provider_id, 'modelId', run.model_id,
    'cancellationRequested', COALESCE(run.cancellation_requested_at IS NOT NULL, false)
    ) ORDER BY run.created_at DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT * FROM builder.builder_run
    WHERE account_id = p_account_id AND project_id = p_project_id
    ORDER BY created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  ) AS run;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION builder.list_builder_runs(uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.list_builder_runs(uuid,uuid,integer) TO hub_rb_ingress;

RESET ROLE;
COMMIT;
