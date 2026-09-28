BEGIN;

-- An installation administrator can delete a Project, its data and its GitHub repository. The
-- tombstone is written first, in its own row, so the request survives a crash anywhere in the
-- teardown that follows: Mastra Factory sessions and connections, the application's preview schema
-- and database role, every Hub row that names the Project, and finally the GitHub repository
-- itself. The tombstone is never removed; completed_at marks when the last step finished.
CREATE TABLE project.project_deletion (
    project_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    requested_by uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    factory_project_id text,
    project_repository_id text,
    repository_id text,
    completed_at timestamp with time zone,
    CONSTRAINT project_deletion_pkey PRIMARY KEY (project_id),
    CONSTRAINT project_deletion_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspace.workspace(workspace_id),
    CONSTRAINT project_deletion_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES iam.account(account_id),
    CONSTRAINT project_deletion_name_check CHECK ((length(btrim(name)) >= 1)),
    CONSTRAINT project_deletion_completion_order_check CHECK ((completed_at IS NULL OR completed_at >= requested_at))
);

ALTER TABLE project.project_deletion OWNER TO project_owner;

REVOKE ALL ON TABLE project.project_deletion FROM PUBLIC;
-- iam.admit_project and iam.visible_projects only need to know a tombstone exists and whether it
-- finished, never what it names.
GRANT SELECT(project_id, completed_at) ON TABLE project.project_deletion TO iam_owner;

-- A tombstoned Project is refused admission immediately, closing the window between the tombstone
-- and the purge during which the Project row still exists -- except to the installation
-- administrator, while the deletion has not finished. That is the only product-level recovery path
-- after a crash or a failed step: the administrator can still load the Project and press delete
-- again, which resumes the same tombstone, instead of the Project becoming permanently unreachable
-- the moment it is tombstoned. Once completed_at is set the row is purged moments later regardless,
-- so nobody is admitted to it again.
CREATE OR REPLACE FUNCTION iam.admit_project(p_account_id uuid, p_project_id uuid, p_action iam.action) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  owning_workspace_id uuid;
BEGIN
  PERFORM 1
  FROM iam.account AS locked_account
  WHERE locked_account.account_id = p_account_id
  FOR SHARE;

  IF EXISTS (
    SELECT 1 FROM project.project_deletion
    WHERE project_id = p_project_id
      AND (completed_at IS NOT NULL OR NOT iam.is_installation_administrator(p_account_id))
  ) THEN
    RAISE EXCEPTION 'PROJECT_DELETING' USING ERRCODE = '42501';
  END IF;

  SELECT stored_project.workspace_id INTO owning_workspace_id
  FROM project.project AS stored_project
  WHERE stored_project.project_id = p_project_id;
  IF owning_workspace_id IS NULL THEN
    RAISE EXCEPTION 'NOT_ADMITTED' USING ERRCODE = '42501';
  END IF;
  PERFORM iam.admit_workspace(p_account_id, owning_workspace_id, p_action);
  RETURN owning_workspace_id;
END;
$$;

-- A tombstoned Project stops showing up to the account it belonged to the moment the tombstone is
-- written, everywhere a Project list or a single Project read is built from this function -- except
-- to the installation administrator, mirroring iam.admit_project above, so GetProject keeps working
-- for the one caller who can resume or has to watch an interrupted deletion finish.
CREATE OR REPLACE FUNCTION iam.visible_projects(p_account_id uuid) RETURNS TABLE(project_id uuid, workspace_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT stored_project.project_id, stored_project.workspace_id
  FROM project.project AS stored_project
  JOIN iam.visible_workspaces(p_account_id) AS visible
    ON visible.workspace_id = stored_project.workspace_id
  WHERE NOT EXISTS (
    SELECT 1 FROM project.project_deletion AS deletion
    WHERE deletion.project_id = stored_project.project_id
      AND (deletion.completed_at IS NOT NULL OR NOT iam.is_installation_administrator(p_account_id))
  );
$$;

-- Every schema that names a Project purges its own rows. Each function is owned by the schema that
-- owns the rows it deletes, and only project_owner is granted execute, so project.purge_project is
-- the one place the whole teardown is assembled.
CREATE FUNCTION iam.purge_project(p_project_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM iam.handoff
  WHERE project_id = p_project_id
     OR preview_id IN (SELECT preview_id FROM iam.preview WHERE project_id = p_project_id);
  DELETE FROM iam.host_session
  WHERE project_id = p_project_id
     OR preview_id IN (SELECT preview_id FROM iam.preview WHERE project_id = p_project_id);
  DELETE FROM iam.preview WHERE project_id = p_project_id;
  DELETE FROM iam.application_grant WHERE project_id = p_project_id;
  DELETE FROM iam.application_invitation WHERE project_id = p_project_id;
  DELETE FROM iam.application WHERE project_id = p_project_id;
END;
$$;

ALTER FUNCTION iam.purge_project(p_project_id uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.purge_project(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.purge_project(p_project_id uuid) TO project_owner;

CREATE FUNCTION connector.purge_project(p_project_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  DELETE FROM connector.project_grant WHERE project_id = p_project_id;
$$;

ALTER FUNCTION connector.purge_project(p_project_id uuid) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.purge_project(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.purge_project(p_project_id uuid) TO project_owner;
GRANT USAGE ON SCHEMA connector TO project_owner;

CREATE FUNCTION reg.purge_project(p_project_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  -- An 'application' artifact never publishes a revision (artifact_kind_ownership_check forces
  -- published_revision_id NULL wherever project_id is set), so revisions can go straight away.
  DELETE FROM reg.artifact_revision
  WHERE artifact_id IN (SELECT artifact_id FROM reg.artifact WHERE project_id = p_project_id);
  DELETE FROM reg.artifact WHERE project_id = p_project_id;
END;
$$;

ALTER FUNCTION reg.purge_project(p_project_id uuid) OWNER TO registry_owner;

REVOKE ALL ON FUNCTION reg.purge_project(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION reg.purge_project(p_project_id uuid) TO project_owner;

CREATE FUNCTION builder.purge_project(p_project_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM builder.builder_run WHERE project_id = p_project_id;
  DELETE FROM builder.project_working_state WHERE project_id = p_project_id;
  DELETE FROM builder.factory_binding WHERE project_id = p_project_id;
END;
$$;

ALTER FUNCTION builder.purge_project(p_project_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.purge_project(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.purge_project(p_project_id uuid) TO project_owner;

-- begin_project_deletion is idempotent by project_id: a retry with the same name returns the same
-- tombstone instead of writing a second one, so the orchestrator can resume after a crash.
GRANT ALL ON FUNCTION iam.is_installation_administrator(p_account_id uuid) TO project_owner;
GRANT ALL ON FUNCTION builder.read_factory_binding_for_project(p_project_id uuid) TO project_owner;

-- plan_project_deletion runs every refusal begin_project_deletion can raise, without writing the
-- tombstone, so the orchestrator can preflight the GitHub repository permission the deletion needs
-- before the first destructive or durable step. Nothing ties the two calls together atomically, so
-- begin_project_deletion repeats every one of these checks itself rather than trusting the plan.
-- is_retry tells the orchestrator whether this deletion already has a tombstone: only a brand-new
-- request needs the live Administration: write probe, because a retry's repository may already be
-- gone (the previous attempt's own idempotent GitHub delete), and a live grant can no longer be
-- proven for a repository that no longer exists. The probe would refuse the retry forever instead
-- of letting the already-idempotent delete step observe the 404 it already tolerates.
CREATE FUNCTION project.plan_project_deletion(p_account_id uuid, p_project_id uuid, p_confirm_name text) RETURNS TABLE(repository_id text, is_retry boolean)
    LANGUAGE plpgsql SECURITY DEFINER STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  existing project.project_deletion%ROWTYPE;
  target project.project%ROWTYPE;
  binding jsonb;
BEGIN
  IF NOT iam.is_installation_administrator(p_account_id) THEN
    RAISE EXCEPTION 'NOT_ADMITTED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing FROM project.project_deletion WHERE project_id = p_project_id;
  IF FOUND THEN
    IF existing.name <> p_confirm_name THEN RAISE EXCEPTION 'PROJECT_NAME_MISMATCH'; END IF;
    RETURN QUERY SELECT existing.repository_id, true;
    RETURN;
  END IF;

  SELECT * INTO target FROM project.project WHERE project_id = p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF target.name <> p_confirm_name THEN RAISE EXCEPTION 'PROJECT_NAME_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN
    RAISE EXCEPTION 'PROJECT_BUSY';
  END IF;

  binding := builder.read_factory_binding_for_project(p_project_id);
  RETURN QUERY SELECT binding->>'repositoryId', false;
END;
$$;

ALTER FUNCTION project.plan_project_deletion(p_account_id uuid, p_project_id uuid, p_confirm_name text) OWNER TO project_owner;

REVOKE ALL ON FUNCTION project.plan_project_deletion(p_account_id uuid, p_project_id uuid, p_confirm_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION project.plan_project_deletion(p_account_id uuid, p_project_id uuid, p_confirm_name text) TO hub_project_command;

CREATE FUNCTION project.begin_project_deletion(p_account_id uuid, p_project_id uuid, p_confirm_name text) RETURNS project.project_deletion
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  existing project.project_deletion%ROWTYPE;
  target project.project%ROWTYPE;
  binding jsonb;
BEGIN
  IF NOT iam.is_installation_administrator(p_account_id) THEN
    RAISE EXCEPTION 'NOT_ADMITTED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing FROM project.project_deletion WHERE project_id = p_project_id;
  IF FOUND THEN
    IF existing.name <> p_confirm_name THEN RAISE EXCEPTION 'PROJECT_NAME_MISMATCH'; END IF;
    RETURN existing;
  END IF;

  SELECT * INTO target FROM project.project WHERE project_id = p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF target.name <> p_confirm_name THEN RAISE EXCEPTION 'PROJECT_NAME_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN
    RAISE EXCEPTION 'PROJECT_BUSY';
  END IF;

  binding := builder.read_factory_binding_for_project(p_project_id);

  INSERT INTO project.project_deletion(
    project_id, workspace_id, name, requested_by,
    factory_project_id, project_repository_id, repository_id
  ) VALUES (
    p_project_id, target.workspace_id, target.name, p_account_id,
    binding->>'factoryProjectId', binding->>'projectRepositoryId', binding->>'repositoryId'
  )
  RETURNING * INTO existing;

  RETURN existing;
END;
$$;

ALTER FUNCTION project.begin_project_deletion(p_account_id uuid, p_project_id uuid, p_confirm_name text) OWNER TO project_owner;

REVOKE ALL ON FUNCTION project.begin_project_deletion(p_account_id uuid, p_project_id uuid, p_confirm_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION project.begin_project_deletion(p_account_id uuid, p_project_id uuid, p_confirm_name text) TO hub_project_command;

-- purge_project is the transaction boundary: every Hub row that names the Project is gone, or none
-- of them are. It runs after Mastra, the application's preview schema and GitHub have already been
-- torn down, so it never has to reach outside Postgres.
CREATE FUNCTION project.purge_project(p_project_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM project.project_deletion WHERE project_id = p_project_id) THEN
    RAISE EXCEPTION 'PROJECT_DELETION_NOT_STARTED';
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN
    RAISE EXCEPTION 'PROJECT_BUSY';
  END IF;

  PERFORM iam.purge_project(p_project_id);
  PERFORM connector.purge_project(p_project_id);
  PERFORM reg.purge_project(p_project_id);
  PERFORM builder.purge_project(p_project_id);

  DELETE FROM project.operation_idempotency WHERE reserved_project_id = p_project_id;
  DELETE FROM project.project WHERE project_id = p_project_id;
END;
$$;

ALTER FUNCTION project.purge_project(p_project_id uuid) OWNER TO project_owner;

REVOKE ALL ON FUNCTION project.purge_project(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION project.purge_project(p_project_id uuid) TO hub_project_command;

-- complete_project_deletion only stamps the tombstone once the GitHub repository is gone too; it is
-- a no-op on retry.
CREATE FUNCTION project.complete_project_deletion(p_project_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  UPDATE project.project_deletion SET completed_at = clock_timestamp()
  WHERE project_id = p_project_id AND completed_at IS NULL;
$$;

ALTER FUNCTION project.complete_project_deletion(p_project_id uuid) OWNER TO project_owner;

REVOKE ALL ON FUNCTION project.complete_project_deletion(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION project.complete_project_deletion(p_project_id uuid) TO hub_project_command;

-- purge_project deletes the project.project row before the GitHub repository is gone, so the
-- recovery path iam.visible_projects/iam.admit_project open for the installation administrator
-- above still needs somewhere to read once that row no longer exists. get_project now falls back
-- to the tombstone itself for that one caller while completed_at is still null, so GetProject keeps
-- answering and the settings screen keeps offering retry instead of the request 404ing right when
-- the administrator most needs to see and finish it. The return type changes (a new deleting
-- column), which CREATE OR REPLACE refuses, so the old function is dropped first; the input
-- signature is unchanged, so its grants below re-establish the same access.
DROP FUNCTION project.get_project(p_account_id uuid, p_project_id uuid);

CREATE FUNCTION project.get_project(p_account_id uuid, p_project_id uuid) RETURNS TABLE(project_id uuid, workspace_id uuid, name text, project_revision text, archived boolean, deleting boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  live project.project%ROWTYPE;
  tomb project.project_deletion%ROWTYPE;
BEGIN
  SELECT stored_project.* INTO live
  FROM project.project AS stored_project
  JOIN iam.visible_projects(p_account_id) AS visible
    ON visible.project_id = stored_project.project_id
  WHERE stored_project.project_id = p_project_id;

  IF FOUND THEN
    RETURN QUERY SELECT live.project_id, live.workspace_id, live.name, live.project_revision, live.archived,
      EXISTS (SELECT 1 FROM project.project_deletion AS deletion WHERE deletion.project_id = p_project_id AND deletion.completed_at IS NULL);
    RETURN;
  END IF;

  IF iam.is_installation_administrator(p_account_id) THEN
    SELECT * INTO tomb FROM project.project_deletion WHERE project_id = p_project_id AND completed_at IS NULL;
    IF FOUND THEN
      RETURN QUERY SELECT tomb.project_id, tomb.workspace_id, tomb.name, ''::text, false, true;
    END IF;
  END IF;
END;
$$;

ALTER FUNCTION project.get_project(p_account_id uuid, p_project_id uuid) OWNER TO project_owner;

REVOKE ALL ON FUNCTION project.get_project(p_account_id uuid, p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION project.get_project(p_account_id uuid, p_project_id uuid) TO hub_project_read;

-- The Projects home is the other place a purged-but-incomplete tombstone would otherwise vanish
-- without a trace: once purge_project removes the project.project row, the ordinary join below
-- stops naming it at all, for every account including the installation administrator who has to
-- finish it. A second branch, administrator-only, adds exactly those tombstones back from
-- project.project_deletion itself, carrying deleting true so the card can point at the retry
-- screen instead of the Project just disappearing mid-deletion.
CREATE OR REPLACE FUNCTION project.list_project_summaries_with_activity(p_account_id uuid, p_workspace_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'projectId', combined.project_id,
    'name', combined.name,
    'archived', combined.archived,
    'lastActivityAt', to_char(combined.last_activity_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'latestRun', combined.latest_run,
    'hasPreview', combined.has_preview,
    'deleting', combined.deleting
  ) ORDER BY combined.last_activity_at DESC, combined.project_id), '[]'::jsonb)
  FROM (
    SELECT
      stored_project.project_id, stored_project.name, stored_project.archived,
      COALESCE(latest_run.created_at, stored_project.created_at) AS last_activity_at,
      -- A tombstoned Project stops taking new builder-session or Preview activity, so its card
      -- shows neither once the deletion it cannot outlive has started.
      CASE WHEN deletion.project_id IS NOT NULL OR latest_run.builder_run_id IS NULL THEN NULL
        ELSE jsonb_build_object('state', latest_run.state, 'resultKind', latest_run.result_kind) END AS latest_run,
      deletion.project_id IS NULL AND working.last_preview_source_revision IS NOT NULL AS has_preview,
      deletion.project_id IS NOT NULL AS deleting
    FROM project.project AS stored_project
    JOIN iam.visible_projects(p_account_id) AS visible
      ON visible.project_id = stored_project.project_id
    LEFT JOIN LATERAL (
      SELECT run.builder_run_id, run.state, run.result_kind, run.created_at
      FROM builder.builder_run AS run
      WHERE run.project_id = stored_project.project_id
      ORDER BY run.created_at DESC, run.builder_run_id DESC
      LIMIT 1
    ) AS latest_run ON true
    LEFT JOIN builder.project_working_state AS working
      ON working.project_id = stored_project.project_id
    LEFT JOIN project.project_deletion AS deletion
      ON deletion.project_id = stored_project.project_id AND deletion.completed_at IS NULL
    WHERE stored_project.workspace_id = p_workspace_id

    UNION ALL

    SELECT
      tomb.project_id, tomb.name, false AS archived,
      tomb.requested_at AS last_activity_at,
      NULL::jsonb AS latest_run,
      false AS has_preview,
      true AS deleting
    FROM project.project_deletion AS tomb
    WHERE tomb.workspace_id = p_workspace_id
      AND tomb.completed_at IS NULL
      AND iam.is_installation_administrator(p_account_id)
      AND NOT EXISTS (SELECT 1 FROM project.project AS purged WHERE purged.project_id = tomb.project_id)
  ) AS combined;
$$;

ALTER FUNCTION project.list_project_summaries_with_activity(p_account_id uuid, p_workspace_id uuid) OWNER TO project_owner;

REVOKE ALL ON FUNCTION project.list_project_summaries_with_activity(p_account_id uuid, p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION project.list_project_summaries_with_activity(p_account_id uuid, p_workspace_id uuid) TO hub_project_read;

COMMIT;
