BEGIN;

-- A repository's GitHub id, slug and default branch are the Factory's repositories row, which the
-- Hub reads when a run starts and which provisioning refreshes. The binding keeps only what Conexus
-- owns: the Project, its Factory project and project repository, and the one repositories row the
-- Project is bound to. One Project per repository is now one per repositories row, which the
-- Factory keeps unique per installation and GitHub id; the Hub connects one installation.
DROP FUNCTION builder.bind_factory_project(p_project_id uuid, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_repository_external_id bigint, p_repository_slug text, p_default_branch text, p_head_revision text);

ALTER TABLE builder.factory_binding
    DROP COLUMN repository_external_id,
    DROP COLUMN repository_slug,
    DROP COLUMN default_branch,
    ADD CONSTRAINT factory_binding_repository_id_key UNIQUE (repository_id);

CREATE OR REPLACE FUNCTION builder.factory_binding_document(p_binding builder.factory_binding) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT jsonb_build_object(
    'projectId', p_binding.project_id,
    'factoryProjectId', p_binding.factory_project_id,
    'projectRepositoryId', p_binding.project_repository_id,
    'repositoryId', p_binding.repository_id,
    'boundAt', to_char(p_binding.bound_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
$$;

CREATE FUNCTION builder.bind_factory_project(p_project_id uuid, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_head_revision text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE working builder.project_working_state%ROWTYPE; existing builder.factory_binding%ROWTYPE;
BEGIN
  IF p_head_revision IS NULL OR p_head_revision !~ '^[0-9a-f]{40}$' THEN RAISE EXCEPTION 'FACTORY_BINDING_INPUT_REFUSED'; END IF;
  -- The working state row is the lock create_builder_run takes before it inserts a run, so no run
  -- can appear between the checks below and the bind.
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND'; END IF;
  SELECT * INTO existing FROM builder.factory_binding WHERE project_id = p_project_id;
  IF FOUND THEN
    -- The head revision is not compared: once a bound Project admits source the working revision
    -- moves past the head it was bound at, and a provisioning retry must still converge.
    IF existing.factory_project_id <> p_factory_project_id OR existing.project_repository_id <> p_project_repository_id
      OR existing.repository_id <> p_repository_id THEN
      RAISE EXCEPTION 'FACTORY_BINDING_CONFLICT';
    END IF;
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id) THEN RAISE EXCEPTION 'FACTORY_BINDING_PROJECT_HAS_RUNS'; END IF;
  IF working.working_version <> 0 THEN RAISE EXCEPTION 'FACTORY_BINDING_WORKING_VERSION_ADVANCED'; END IF;
  IF EXISTS (SELECT 1 FROM builder.factory_binding WHERE project_repository_id = p_project_repository_id OR repository_id = p_repository_id) THEN
    RAISE EXCEPTION 'FACTORY_BINDING_REPOSITORY_BOUND';
  END IF;
  INSERT INTO builder.factory_binding(project_id, factory_project_id, project_repository_id, repository_id)
  VALUES (p_project_id, p_factory_project_id, p_project_repository_id, p_repository_id);
  UPDATE builder.project_working_state SET working_source_revision = p_head_revision, updated_at = clock_timestamp()
  WHERE project_id = p_project_id;
  RETURN true;
END;
$$;

ALTER FUNCTION builder.bind_factory_project(p_project_id uuid, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_head_revision text) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.bind_factory_project(p_project_id uuid, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_head_revision text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.bind_factory_project(p_project_id uuid, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_head_revision text) TO hub_builder_executor;

-- Provisioning reaches the Factory project it bound by id, so a renamed or duplicated Factory
-- project row can never be taken for it.
CREATE FUNCTION builder.read_factory_binding_for_project(p_project_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT builder.factory_binding_document(binding) FROM builder.factory_binding AS binding WHERE binding.project_id = p_project_id;
$$;

ALTER FUNCTION builder.read_factory_binding_for_project(p_project_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.read_factory_binding_for_project(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.read_factory_binding_for_project(p_project_id uuid) TO hub_builder_executor;

COMMIT;
