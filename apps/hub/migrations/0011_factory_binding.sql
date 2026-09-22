BEGIN;

-- A Project is Factory-backed when it has a factory_binding row. It is bound by its repository's
-- GitHub id, which survives renames and reinstalls; the installation is only how it is reached.
CREATE TABLE builder.factory_binding (
    project_id uuid NOT NULL,
    factory_project_id text NOT NULL,
    project_repository_id text NOT NULL,
    repository_id text NOT NULL,
    repository_external_id bigint NOT NULL,
    repository_slug text NOT NULL,
    default_branch text NOT NULL,
    bound_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT factory_binding_pkey PRIMARY KEY (project_id),
    CONSTRAINT factory_binding_project_repository_id_key UNIQUE (project_repository_id),
    CONSTRAINT factory_binding_repository_external_id_key UNIQUE (repository_external_id),
    CONSTRAINT factory_binding_project_id_fkey FOREIGN KEY (project_id) REFERENCES project.project(project_id) ON DELETE RESTRICT,
    CONSTRAINT factory_binding_identifiers_check CHECK (((length(btrim(factory_project_id)) >= 1) AND (length(btrim(project_repository_id)) >= 1) AND (length(btrim(repository_id)) >= 1))),
    CONSTRAINT factory_binding_repository_external_id_check CHECK ((repository_external_id > 0)),
    CONSTRAINT factory_binding_repository_slug_check CHECK ((repository_slug ~ '^[^/\s]+/[^/\s]+$'::text)),
    CONSTRAINT factory_binding_default_branch_check CHECK ((length(btrim(default_branch)) >= 1))
);

ALTER TABLE builder.factory_binding OWNER TO builder_owner;

CREATE FUNCTION builder.factory_binding_document(p_binding builder.factory_binding) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT jsonb_build_object(
    'projectId', p_binding.project_id,
    'factoryProjectId', p_binding.factory_project_id,
    'projectRepositoryId', p_binding.project_repository_id,
    'repositoryId', p_binding.repository_id,
    'repositoryExternalId', p_binding.repository_external_id,
    'repositorySlug', p_binding.repository_slug,
    'defaultBranch', p_binding.default_branch,
    'boundAt', to_char(p_binding.bound_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
$$;

ALTER FUNCTION builder.factory_binding_document(p_binding builder.factory_binding) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.factory_binding_document(p_binding builder.factory_binding) FROM PUBLIC;

CREATE FUNCTION builder.bind_factory_project(p_project_id uuid, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_repository_external_id bigint, p_repository_slug text, p_default_branch text, p_head_revision text) RETURNS boolean
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
      OR existing.repository_id <> p_repository_id OR existing.repository_external_id <> p_repository_external_id
      OR existing.repository_slug <> p_repository_slug OR existing.default_branch <> p_default_branch THEN
      RAISE EXCEPTION 'FACTORY_BINDING_CONFLICT';
    END IF;
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id) THEN RAISE EXCEPTION 'FACTORY_BINDING_PROJECT_HAS_RUNS'; END IF;
  IF working.working_version <> 0 THEN RAISE EXCEPTION 'FACTORY_BINDING_WORKING_VERSION_ADVANCED'; END IF;
  IF EXISTS (SELECT 1 FROM builder.factory_binding WHERE project_repository_id = p_project_repository_id OR repository_external_id = p_repository_external_id) THEN
    RAISE EXCEPTION 'FACTORY_BINDING_REPOSITORY_BOUND';
  END IF;
  INSERT INTO builder.factory_binding(project_id, factory_project_id, project_repository_id, repository_id, repository_external_id, repository_slug, default_branch)
  VALUES (p_project_id, p_factory_project_id, p_project_repository_id, p_repository_id, p_repository_external_id, p_repository_slug, p_default_branch);
  UPDATE builder.project_working_state SET working_source_revision = p_head_revision, updated_at = clock_timestamp()
  WHERE project_id = p_project_id;
  RETURN true;
END;
$$;

ALTER FUNCTION builder.bind_factory_project(p_project_id uuid, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_repository_external_id bigint, p_repository_slug text, p_default_branch text, p_head_revision text) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.bind_factory_project(p_project_id uuid, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_repository_external_id bigint, p_repository_slug text, p_default_branch text, p_head_revision text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.bind_factory_project(p_project_id uuid, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_repository_external_id bigint, p_repository_slug text, p_default_branch text, p_head_revision text) TO hub_builder_executor;

CREATE FUNCTION builder.read_factory_binding_for_run(p_builder_run_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT builder.factory_binding_document(binding)
  FROM builder.builder_run AS run
  JOIN builder.factory_binding AS binding ON binding.project_id = run.project_id
  WHERE run.builder_run_id = p_builder_run_id;
$$;

ALTER FUNCTION builder.read_factory_binding_for_run(p_builder_run_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.read_factory_binding_for_run(p_builder_run_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.read_factory_binding_for_run(p_builder_run_id uuid) TO hub_builder_executor;

CREATE FUNCTION builder.list_factory_admission_runs() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'builderRunId', run.builder_run_id,
    'projectId', run.project_id,
    'conversationId', run.conversation_id,
    'baseSourceRevision', run.base_source_revision,
    'binding', builder.factory_binding_document(binding)
  ) ORDER BY run.created_at, run.builder_run_id), '[]'::jsonb)
  FROM builder.builder_run AS run
  JOIN builder.factory_binding AS binding ON binding.project_id = run.project_id
  WHERE run.state = 'RUNNING' AND run.phase = 'SOURCE_ADMISSION';
$$;

ALTER FUNCTION builder.list_factory_admission_runs() OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.list_factory_admission_runs() FROM PUBLIC;
GRANT ALL ON FUNCTION builder.list_factory_admission_runs() TO hub_builder_executor;

CREATE FUNCTION builder.read_factory_binding(p_account_id uuid, p_project_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE binding builder.factory_binding%ROWTYPE;
BEGIN
  PERFORM iam.admit_project(p_account_id, p_project_id, 'project.build');
  SELECT * INTO binding FROM builder.factory_binding WHERE project_id = p_project_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN builder.factory_binding_document(binding);
END;
$$;

ALTER FUNCTION builder.read_factory_binding(p_account_id uuid, p_project_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.read_factory_binding(p_account_id uuid, p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.read_factory_binding(p_account_id uuid, p_project_id uuid) TO hub_builder_ingress;

CREATE FUNCTION builder.resolve_factory_project(p_account_id uuid, p_project_repository_id text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE bound_project_id uuid;
BEGIN
  SELECT project_id INTO bound_project_id FROM builder.factory_binding WHERE project_repository_id = p_project_repository_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- An unknown repository and one the Account may not build answer the same, so the answer does
  -- not disclose which repositories are bound.
  BEGIN
    PERFORM iam.admit_project(p_account_id, bound_project_id, 'project.build');
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN NULL;
  END;
  RETURN bound_project_id;
END;
$$;

ALTER FUNCTION builder.resolve_factory_project(p_account_id uuid, p_project_repository_id text) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.resolve_factory_project(p_account_id uuid, p_project_repository_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.resolve_factory_project(p_account_id uuid, p_project_repository_id text) TO hub_builder_ingress;

-- @mastra/pg's PgFactoryStorage creates and migrates its own tables at runtime, so hub_factory owns
-- the factory schema outright instead of an owner role holding it. It is granted nothing else, and
-- no other role is granted anything on factory.
DO $$ BEGIN
  CREATE ROLE "hub_factory" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SCHEMA factory AUTHORIZATION hub_factory;

COMMIT;
