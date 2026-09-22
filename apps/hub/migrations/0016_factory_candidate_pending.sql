BEGIN;

-- A running run with a candidate may have its source on the default branch, so only candidate
-- reconciliation settles it; a restart interrupts every other queued or running run.
CREATE OR REPLACE FUNCTION builder.recover_builder_runs() RETURNS SETOF uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  UPDATE builder.builder_run SET state = 'INTERRUPTED', failure_code = 'HUB_RESTART', finished_at = clock_timestamp()
  WHERE state = 'QUEUED' OR (state = 'RUNNING' AND candidate_source_revision IS NULL);
  RETURN QUERY SELECT builder_run_id FROM builder.builder_run WHERE state = 'QUEUED' ORDER BY created_at;
END;
$$;

COMMIT;
