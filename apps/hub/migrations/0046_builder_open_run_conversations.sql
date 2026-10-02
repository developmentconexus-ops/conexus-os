BEGIN;

-- The conversations that have a run queued or running, a run parked on a question included (a
-- parked run is a running one). The idle-machine sweep never deletes the machine of one of these.
CREATE FUNCTION builder.read_open_run_conversations() RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
  SELECT COALESCE(array_agg(DISTINCT conversation_id), '{}')
  FROM builder.builder_run
  WHERE state IN ('QUEUED', 'RUNNING');
$_$;

ALTER FUNCTION builder.read_open_run_conversations() OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.read_open_run_conversations() FROM PUBLIC;
GRANT ALL ON FUNCTION builder.read_open_run_conversations() TO hub_builder_executor;

COMMIT;
