BEGIN;

-- The runs that are running with no candidate offered and not parked on a question. A run in
-- this list that no leg of this Hub owns lost its ending to a failed write, and the Hub settles it.
-- A run with a candidate is settled by reading `main` (list_admission_runs); a parked run waits for its answer.
CREATE FUNCTION builder.list_unowned_run_candidates() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'builderRunId', run.builder_run_id,
    'projectId', run.project_id,
    'conversationId', run.conversation_id
  ) ORDER BY run.created_at, run.builder_run_id), '[]'::jsonb)
  FROM builder.builder_run AS run
  WHERE run.state = 'RUNNING' AND run.candidate_revision IS NULL AND run.phase IS DISTINCT FROM 'PARKED';
$$;

ALTER FUNCTION builder.list_unowned_run_candidates() OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.list_unowned_run_candidates() FROM PUBLIC;
GRANT ALL ON FUNCTION builder.list_unowned_run_candidates() TO hub_builder_executor;

COMMIT;
