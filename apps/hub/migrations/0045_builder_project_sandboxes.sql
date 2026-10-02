BEGIN;

-- The provider ids of every VM the Project's conversations recorded, read before the Project is
-- purged so its deletion can kill them: the purge drops the rows that name them.
CREATE FUNCTION builder.read_project_sandboxes(p_project_id uuid) RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
  SELECT COALESCE(array_agg(provider_sandbox_id ORDER BY provider_sandbox_id), '{}')
  FROM builder.conversation_session
  WHERE project_id = p_project_id AND provider_sandbox_id IS NOT NULL;
$_$;

ALTER FUNCTION builder.read_project_sandboxes(p_project_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.read_project_sandboxes(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.read_project_sandboxes(p_project_id uuid) TO hub_builder_executor;

COMMIT;
