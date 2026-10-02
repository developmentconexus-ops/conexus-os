BEGIN;

-- A run parked on a question nobody answers holds its Project busy. After the idle limit since it
-- parked, it is interrupted with its own code, so the Project is free again. An answer that took the
-- run out of PARKED first leaves it out of the update, and one that comes after finds it closed.
-- Nobody asked for the stop, so no cancellation is recorded and the person reads why it ended.
CREATE FUNCTION builder.expire_parked_builder_runs(p_idle_ms integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE expired jsonb;
BEGIN
  WITH ended AS (
    UPDATE builder.builder_run
    SET state = 'INTERRUPTED', phase = NULL, failure_code = 'BUILDER_RUN_PARKED_EXPIRED', finished_at = clock_timestamp()
    WHERE state = 'RUNNING' AND phase = 'PARKED'
      AND parked_at < clock_timestamp() - make_interval(secs => p_idle_ms / 1000.0)
    RETURNING *
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'builderRunId', builder_run_id, 'projectId', project_id, 'conversationId', conversation_id,
    'state', state, 'phase', phase, 'baseSourceRevision', base_source_revision,
    'resultSourceRevision', result_source_revision, 'resultKind', result_kind,
    'failureCode', failure_code, 'requestText', request_text,
    'createdAt', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'cancellationRequested', cancellation_requested_at IS NOT NULL
  ) ORDER BY created_at, builder_run_id), '[]'::jsonb) INTO expired FROM ended;
  RETURN expired;
END;
$$;

ALTER FUNCTION builder.expire_parked_builder_runs(p_idle_ms integer) OWNER TO builder_owner;
REVOKE ALL ON FUNCTION builder.expire_parked_builder_runs(p_idle_ms integer) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.expire_parked_builder_runs(p_idle_ms integer) TO hub_builder_executor;

COMMIT;
