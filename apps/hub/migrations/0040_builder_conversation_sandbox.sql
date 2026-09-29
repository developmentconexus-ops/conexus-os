BEGIN;

-- A conversation keeps one E2B sandbox across its turns (spec 0002 amendment, B3). The Hub records
-- the provider id of the VM a turn ran on, and the next turn asks E2B for that exact VM before it
-- looks one up by the conversation's logical id. A conversation stays in the Project it started in.
CREATE FUNCTION builder.record_conversation_sandbox(p_project_id uuid, p_conversation_id uuid, p_provider_sandbox_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
BEGIN
  IF p_provider_sandbox_id IS NULL OR p_provider_sandbox_id !~ '^[A-Za-z0-9_-]{1,128}$' THEN
    RAISE EXCEPTION 'BUILDER_CONVERSATION_SESSION_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO builder.conversation_session AS session (conversation_id, project_id, provider_sandbox_id)
  VALUES (p_conversation_id, p_project_id, p_provider_sandbox_id)
  ON CONFLICT (conversation_id) DO UPDATE SET provider_sandbox_id = EXCLUDED.provider_sandbox_id
  WHERE session.project_id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BUILDER_CONVERSATION_SESSION_REFUSED' USING ERRCODE = 'P0001';
  END IF;
END;
$_$;

ALTER FUNCTION builder.record_conversation_sandbox(p_project_id uuid, p_conversation_id uuid, p_provider_sandbox_id text) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.record_conversation_sandbox(p_project_id uuid, p_conversation_id uuid, p_provider_sandbox_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.record_conversation_sandbox(p_project_id uuid, p_conversation_id uuid, p_provider_sandbox_id text) TO hub_builder_executor;

-- The provider id of the conversation's sandbox, or null when it has none recorded in this Project.
CREATE FUNCTION builder.read_conversation_sandbox(p_project_id uuid, p_conversation_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
  SELECT provider_sandbox_id FROM builder.conversation_session
  WHERE conversation_id = p_conversation_id AND project_id = p_project_id;
$_$;

ALTER FUNCTION builder.read_conversation_sandbox(p_project_id uuid, p_conversation_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.read_conversation_sandbox(p_project_id uuid, p_conversation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.read_conversation_sandbox(p_project_id uuid, p_conversation_id uuid) TO hub_builder_executor;

COMMIT;
