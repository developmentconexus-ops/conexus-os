BEGIN;

DROP FUNCTION builder.heartbeat_builder_runs(p_owner_id uuid, p_builder_run_ids uuid[]);
DROP FUNCTION builder.take_over_stale_builder_runs(p_owner_id uuid, p_stale_after_ms integer);

-- One call renews the lease and takes over what went stale. The clock is read once: it is the beat
-- and the base of the cutoff, so a run is never beaten and taken in one call. A run the caller lists
-- is never taken, however old its heartbeat or however late this call runs. Rows another Hub is
-- taking over are skipped, so two calls never settle one run.
CREATE FUNCTION builder.renew_run_lease(p_owner_id uuid, p_live_run_ids uuid[], p_stale_after_ms integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE taken jsonb; t timestamptz := clock_timestamp();
BEGIN
  UPDATE builder.builder_run SET heartbeat_at = t
  WHERE builder_run_id = ANY(p_live_run_ids) AND owner_id = p_owner_id AND state IN ('QUEUED', 'RUNNING');

  WITH stale AS (
    SELECT builder_run_id, owner_id AS previous_owner_id FROM builder.builder_run
    WHERE state IN ('QUEUED', 'RUNNING')
      AND builder_run_id <> ALL(p_live_run_ids)
      AND COALESCE(heartbeat_at, created_at) < t - make_interval(secs => p_stale_after_ms / 1000.0)
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE builder.builder_run AS run SET owner_id = p_owner_id, heartbeat_at = t
    FROM stale WHERE run.builder_run_id = stale.builder_run_id
    RETURNING run.builder_run_id, run.project_id, run.conversation_id, run.candidate_revision,
      run.result_source_revision, run.created_at, stale.previous_owner_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'builderRunId', builder_run_id, 'projectId', project_id, 'conversationId', conversation_id,
    'candidateRevision', candidate_revision,
    'resultSourceRevision', result_source_revision, 'previousOwnerId', previous_owner_id
  ) ORDER BY created_at, builder_run_id), '[]'::jsonb) INTO taken FROM updated;
  RETURN taken;
END;
$$;

ALTER FUNCTION builder.renew_run_lease(p_owner_id uuid, p_live_run_ids uuid[], p_stale_after_ms integer) OWNER TO builder_owner;
REVOKE ALL ON FUNCTION builder.renew_run_lease(p_owner_id uuid, p_live_run_ids uuid[], p_stale_after_ms integer) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.renew_run_lease(p_owner_id uuid, p_live_run_ids uuid[], p_stale_after_ms integer) TO hub_builder_executor;

COMMIT;
