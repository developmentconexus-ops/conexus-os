BEGIN;

-- A restart interrupts every run that had not offered a candidate; one that had may be on `main`,
-- and stays running until the Hub reads `main` and settles it. A parked run is left alone, since its
-- answer resumes it. The runs it interrupted from RUNNING are answered, so the Hub can settle the
-- question each may have left open in its conversation thread. The old function answered the ids of
-- queued runs, which the update before it had always just interrupted, so it answered nothing.
DROP FUNCTION builder.recover_builder_runs();

CREATE FUNCTION builder.recover_builder_runs() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE interrupted jsonb;
BEGIN
  WITH updated AS (
    UPDATE builder.builder_run SET state = 'INTERRUPTED', failure_code = 'HUB_RESTART', finished_at = clock_timestamp()
    WHERE state = 'QUEUED' OR (state = 'RUNNING' AND candidate_revision IS NULL AND phase IS DISTINCT FROM 'PARKED')
    RETURNING builder_run_id, project_id, conversation_id, started_at
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'builderRunId', builder_run_id, 'projectId', project_id, 'conversationId', conversation_id
  ) ORDER BY builder_run_id), '[]'::jsonb) INTO interrupted FROM updated WHERE started_at IS NOT NULL;
  RETURN interrupted;
END;
$$;

ALTER FUNCTION builder.recover_builder_runs() OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.recover_builder_runs() FROM PUBLIC;
GRANT ALL ON FUNCTION builder.recover_builder_runs() TO hub_builder_executor;

COMMIT;
