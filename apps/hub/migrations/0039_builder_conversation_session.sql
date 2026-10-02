BEGIN;

-- A conversation owns its working state outside any one turn (spec 0002 amendment, 2026-09-29):
-- the head of its mirror in the Conexus Git, the `main` last brought into its checkout, the E2B
-- sandbox it resumes and when its last turn ended. The Git ref
-- `refs/conexus/conversations/<conversation_id>` is the truth for the mirror; this row records it
-- for the Builder's reads and the idle sweeper. Deleting the Project's repository deletes it.
CREATE TABLE builder.conversation_session (
    conversation_id uuid NOT NULL,
    project_id uuid NOT NULL,
    provider_sandbox_id text,
    mirror_head text,
    synced_main text,
    last_turn_ended_at timestamp with time zone,
    CONSTRAINT conversation_session_pkey PRIMARY KEY (conversation_id),
    CONSTRAINT conversation_session_project_id_fkey FOREIGN KEY (project_id) REFERENCES builder.project_repository(project_id) ON DELETE CASCADE,
    CONSTRAINT conversation_session_mirror_head_check CHECK (mirror_head IS NULL OR mirror_head ~ '^[0-9a-f]{40}$'),
    CONSTRAINT conversation_session_synced_main_check CHECK (synced_main IS NULL OR synced_main ~ '^[0-9a-f]{40}$')
);

ALTER TABLE builder.conversation_session OWNER TO builder_owner;

REVOKE ALL ON TABLE builder.conversation_session FROM PUBLIC;

-- Records the mirror head, and the `main` merged at the turn's start when given; a turn end also
-- stamps the time. A conversation stays in the Project it started in. The same call again converges.
CREATE FUNCTION builder.record_conversation_session(p_project_id uuid, p_conversation_id uuid, p_mirror_head text, p_synced_main text, p_turn_ended boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
BEGIN
  IF p_mirror_head IS NULL OR p_mirror_head !~ '^[0-9a-f]{40}$' OR (p_synced_main IS NOT NULL AND p_synced_main !~ '^[0-9a-f]{40}$') THEN
    RAISE EXCEPTION 'BUILDER_CONVERSATION_SESSION_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO builder.conversation_session AS session (conversation_id, project_id, mirror_head, synced_main, last_turn_ended_at)
  VALUES (p_conversation_id, p_project_id, p_mirror_head, p_synced_main, CASE WHEN p_turn_ended THEN clock_timestamp() END)
  ON CONFLICT (conversation_id) DO UPDATE SET
    mirror_head = EXCLUDED.mirror_head,
    synced_main = COALESCE(EXCLUDED.synced_main, session.synced_main),
    last_turn_ended_at = COALESCE(EXCLUDED.last_turn_ended_at, session.last_turn_ended_at)
  WHERE session.project_id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BUILDER_CONVERSATION_SESSION_REFUSED' USING ERRCODE = 'P0001';
  END IF;
END;
$_$;

ALTER FUNCTION builder.record_conversation_session(p_project_id uuid, p_conversation_id uuid, p_mirror_head text, p_synced_main text, p_turn_ended boolean) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.record_conversation_session(p_project_id uuid, p_conversation_id uuid, p_mirror_head text, p_synced_main text, p_turn_ended boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.record_conversation_session(p_project_id uuid, p_conversation_id uuid, p_mirror_head text, p_synced_main text, p_turn_ended boolean) TO hub_builder_executor;

COMMIT;
