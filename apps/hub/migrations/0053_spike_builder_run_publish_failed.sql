BEGIN;

-- Spike (done gate, option A): a run whose admitted, green source Conexus failed to publish ends as
-- its own result kind, not as a build failure, and its publish can be retried on the same source
-- revision with no agent turn and no new commit.
ALTER TABLE builder.builder_run DROP CONSTRAINT builder_run_result_kind_check;
ALTER TABLE builder.builder_run ADD CONSTRAINT builder_run_result_kind_check CHECK (((result_kind IS NULL) OR (result_kind = ANY (ARRAY['RESPONSE_ONLY'::text, 'SOURCE_CHANGED'::text, 'SOURCE_CHANGED_BUILD_FAILED'::text, 'SOURCE_CHANGED_PUBLISH_FAILED'::text]))));

CREATE FUNCTION builder.settle_builder_run_publish_failed(p_builder_run_id uuid, p_source_revision text, p_failure_code text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  IF p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$' OR p_failure_code IS NULL OR p_failure_code !~ '^[A-Z0-9_]{1,120}$' THEN RETURN false; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'RUNNING' OR run_row.result_source_revision IS DISTINCT FROM p_source_revision THEN RETURN false; END IF;
  -- The working state keeps the last good Preview; the spike leaves its label as BUILD_FAILED.
  UPDATE builder.project_working_state SET current_state = 'BUILD_FAILED', updated_at = clock_timestamp() WHERE project_id = run_row.project_id;
  UPDATE builder.builder_run SET state = 'FAILED', phase = NULL, result_kind = 'SOURCE_CHANGED_PUBLISH_FAILED', failure_code = p_failure_code,
    finished_at = clock_timestamp() WHERE builder_run_id = p_builder_run_id;
  RETURN true;
END;
$_$;

-- Takes a publish-failed run back to RUNNING under this Hub, so its publish runs again. The Project's
-- one-active-run index refuses it while another run works; it is the Project's latest code-changing run.
CREATE FUNCTION builder.reopen_builder_run_publish(p_builder_run_id uuid, p_owner_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'FAILED' OR run_row.result_kind IS DISTINCT FROM 'SOURCE_CHANGED_PUBLISH_FAILED' THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run AS later WHERE later.project_id = run_row.project_id
    AND later.created_at > run_row.created_at AND later.result_kind IN ('SOURCE_CHANGED', 'SOURCE_CHANGED_BUILD_FAILED', 'SOURCE_CHANGED_PUBLISH_FAILED')) THEN RETURN false; END IF;
  BEGIN
    UPDATE builder.builder_run SET state = 'RUNNING', phase = 'FINALIZING', result_kind = NULL, failure_code = NULL, finished_at = NULL,
      owner_id = p_owner_id, heartbeat_at = clock_timestamp() WHERE builder_run_id = p_builder_run_id;
  EXCEPTION WHEN unique_violation THEN RETURN false;
  END;
  RETURN true;
END;
$_$;

ALTER FUNCTION builder.settle_builder_run_publish_failed(uuid, text, text) OWNER TO builder_owner;
REVOKE ALL ON FUNCTION builder.settle_builder_run_publish_failed(uuid, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.settle_builder_run_publish_failed(uuid, text, text) TO hub_builder_executor;
ALTER FUNCTION builder.reopen_builder_run_publish(uuid, uuid) OWNER TO builder_owner;
REVOKE ALL ON FUNCTION builder.reopen_builder_run_publish(uuid, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.reopen_builder_run_publish(uuid, uuid) TO hub_builder_executor;

COMMIT;
