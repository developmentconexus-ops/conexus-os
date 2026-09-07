BEGIN;

DO $$ BEGIN
  CREATE ROLE registry_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE brain_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE connections_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_r2_brain_read LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_r2_brain_bootstrap LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_r2_connections LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_r2_project_binding LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SCHEMA IF NOT EXISTS reg AUTHORIZATION registry_owner;
CREATE SCHEMA IF NOT EXISTS brn AUTHORIZATION brain_owner;
CREATE SCHEMA IF NOT EXISTS con AUTHORIZATION connections_owner;
REVOKE ALL ON SCHEMA reg, brn, con FROM PUBLIC;

SET LOCAL ROLE iam_owner;

ALTER TABLE iam.workspace_membership
  ADD COLUMN can_read_brain boolean NOT NULL DEFAULT false,
  ADD COLUMN can_read_connection boolean NOT NULL DEFAULT false,
  ADD COLUMN can_manage_connection boolean NOT NULL DEFAULT false,
  ADD COLUMN can_qualify_connection boolean NOT NULL DEFAULT false;

ALTER TABLE iam.account_project_grant
  ADD COLUMN can_read_connection boolean NOT NULL DEFAULT false,
  ADD COLUMN can_manage_connection boolean NOT NULL DEFAULT false,
  ADD COLUMN can_qualify_connection boolean NOT NULL DEFAULT false,
  ADD COLUMN can_bind_brain boolean NOT NULL DEFAULT false,
  ADD COLUMN can_use_connection boolean NOT NULL DEFAULT false;

-- The operator-approved P2 successor extends the exact WS-01 creator
-- settlement with brain.read at its first consumer. This is an explicit,
-- independently revocable capability; creator status itself is not consulted
-- by admission and implies no generic later-tranche authority.
UPDATE iam.workspace_membership
SET can_read_brain = true,
  can_read_connection = true,
  can_manage_connection = true,
  can_qualify_connection = true
WHERE can_create_project;

-- Before R2, every direct Project grant is the creator grant established by
-- PRJ-03. Store the P3 successor facts now; later grant administration must
-- never infer them from can_read/can_manage.
UPDATE iam.account_project_grant
SET can_read_connection = true,
  can_manage_connection = true,
  can_qualify_connection = true;

-- P4 is the first consumer of Project-scoped brain.bind and connection.use.
-- Backfill only a direct grant proven by its exact pre-R2 PRJ-03 receipt; a
-- generic Project grant never acquires either specialist fact by implication.
UPDATE iam.account_project_grant AS project_grant
SET can_bind_brain = true,
  can_use_connection = true
FROM project.operation_idempotency AS operation_receipt
JOIN project.project AS stored_project
  ON stored_project.project_id = operation_receipt.reserved_project_id
  AND stored_project.workspace_id = operation_receipt.workspace_id
WHERE operation_receipt.operation_id = 'PRJ-03'
  AND operation_receipt.outcome IN ('RESERVED', 'SUCCEEDED')
  AND project_grant.account_id = operation_receipt.account_id
  AND project_grant.project_id = operation_receipt.reserved_project_id;

CREATE OR REPLACE FUNCTION iam.establish_workspace_creator_access(p_account_id uuid, p_workspace_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO iam.workspace_membership (
    account_id, workspace_id, can_create_project, can_read_brain,
    can_read_connection, can_manage_connection, can_qualify_connection
  ) VALUES (p_account_id, p_workspace_id, true, true, true, true, true);
$$;

CREATE OR REPLACE FUNCTION iam.establish_project_creator_grant(
  p_account_id uuid,
  p_workspace_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_project_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM project.operation_idempotency AS operation_receipt
  JOIN project.project AS stored_project
    ON stored_project.project_id = operation_receipt.reserved_project_id
    AND stored_project.workspace_id = operation_receipt.workspace_id
  WHERE operation_receipt.operation_id = 'PRJ-03'
    AND operation_receipt.account_id = p_account_id
    AND operation_receipt.workspace_id = p_workspace_id
    AND operation_receipt.key_digest = p_key_digest
    AND operation_receipt.request_digest = p_request_digest
    AND operation_receipt.reserved_project_id = p_project_id
    AND operation_receipt.outcome = 'RESERVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRJ03_RECEIPT_NOT_RESERVED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO iam.account_project_grant (
    account_id, project_id, can_read, can_manage,
    can_read_connection, can_manage_connection, can_qualify_connection,
    can_bind_brain, can_use_connection
  ) VALUES (p_account_id, p_project_id, true, true, true, true, true, true, true);
END;
$$;

CREATE FUNCTION iam.admit_brain_read(p_account_id uuid, p_workspace_id uuid)
RETURNS TABLE(workspace_id uuid, can_read_brain boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT membership.workspace_id, membership.can_read_brain
  FROM iam.workspace_membership AS membership
  WHERE membership.account_id = p_account_id
    AND membership.workspace_id = p_workspace_id;
$$;

CREATE FUNCTION iam.admit_any_connection_read(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM iam.workspace_membership AS membership
    WHERE membership.account_id = p_account_id
      AND membership.can_read_connection
    UNION ALL
    SELECT 1
    FROM iam.account_project_grant AS project_grant
    JOIN project.project AS stored_project ON stored_project.project_id = project_grant.project_id
    JOIN iam.workspace_membership AS membership
      ON membership.account_id = project_grant.account_id
      AND membership.workspace_id = stored_project.workspace_id
    WHERE project_grant.account_id = p_account_id
      AND project_grant.can_read_connection
  );
$$;

CREATE FUNCTION iam.admit_connection_read(
  p_account_id uuid,
  p_owner_scope_kind text,
  p_owner_id uuid
) RETURNS TABLE(scope_exists boolean, permitted boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT
    CASE
      WHEN p_owner_scope_kind = 'WORKSPACE' THEN EXISTS (
        SELECT 1 FROM iam.workspace_membership AS membership
        WHERE membership.account_id = p_account_id AND membership.workspace_id = p_owner_id
      )
      WHEN p_owner_scope_kind = 'PROJECT' THEN EXISTS (
        SELECT 1
        FROM iam.account_project_grant AS project_grant
        JOIN project.project AS stored_project ON stored_project.project_id = project_grant.project_id
        JOIN iam.workspace_membership AS membership
          ON membership.account_id = project_grant.account_id
          AND membership.workspace_id = stored_project.workspace_id
        WHERE project_grant.account_id = p_account_id AND project_grant.project_id = p_owner_id
      )
      ELSE false
    END,
    CASE
      WHEN p_owner_scope_kind = 'WORKSPACE' THEN EXISTS (
        SELECT 1 FROM iam.workspace_membership AS membership
        WHERE membership.account_id = p_account_id AND membership.workspace_id = p_owner_id
          AND membership.can_read_connection
      )
      WHEN p_owner_scope_kind = 'PROJECT' THEN EXISTS (
        SELECT 1
        FROM iam.account_project_grant AS project_grant
        JOIN project.project AS stored_project ON stored_project.project_id = project_grant.project_id
        JOIN iam.workspace_membership AS membership
          ON membership.account_id = project_grant.account_id
          AND membership.workspace_id = stored_project.workspace_id
        WHERE project_grant.account_id = p_account_id AND project_grant.project_id = p_owner_id
          AND project_grant.can_read_connection
      )
      ELSE false
    END;
$$;

CREATE FUNCTION iam.admit_connection_manage(
  p_account_id uuid,
  p_owner_scope_kind text,
  p_owner_id uuid
) RETURNS TABLE(scope_exists boolean, permitted boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT
    CASE
      WHEN p_owner_scope_kind = 'WORKSPACE' THEN EXISTS (
        SELECT 1 FROM iam.workspace_membership AS membership
        WHERE membership.account_id = p_account_id AND membership.workspace_id = p_owner_id
      )
      WHEN p_owner_scope_kind = 'PROJECT' THEN EXISTS (
        SELECT 1
        FROM iam.account_project_grant AS project_grant
        JOIN project.project AS stored_project ON stored_project.project_id = project_grant.project_id
        JOIN iam.workspace_membership AS membership
          ON membership.account_id = project_grant.account_id
          AND membership.workspace_id = stored_project.workspace_id
        WHERE project_grant.account_id = p_account_id AND project_grant.project_id = p_owner_id
      )
      ELSE false
    END,
    CASE
      WHEN p_owner_scope_kind = 'WORKSPACE' THEN EXISTS (
        SELECT 1 FROM iam.workspace_membership AS membership
        WHERE membership.account_id = p_account_id AND membership.workspace_id = p_owner_id
          AND membership.can_manage_connection
        FOR SHARE
      )
      WHEN p_owner_scope_kind = 'PROJECT' THEN EXISTS (
        SELECT 1
        FROM iam.account_project_grant AS project_grant
        JOIN project.project AS stored_project ON stored_project.project_id = project_grant.project_id
        JOIN iam.workspace_membership AS membership
          ON membership.account_id = project_grant.account_id
          AND membership.workspace_id = stored_project.workspace_id
        WHERE project_grant.account_id = p_account_id AND project_grant.project_id = p_owner_id
          AND project_grant.can_manage_connection
        FOR SHARE OF project_grant, membership
      )
      ELSE false
    END;
$$;

CREATE FUNCTION iam.admit_connection_qualify(
  p_account_id uuid,
  p_owner_scope_kind text,
  p_owner_id uuid
) RETURNS TABLE(scope_exists boolean, permitted boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT
    CASE
      WHEN p_owner_scope_kind = 'WORKSPACE' THEN EXISTS (
        SELECT 1 FROM iam.workspace_membership AS membership
        WHERE membership.account_id = p_account_id AND membership.workspace_id = p_owner_id
      )
      WHEN p_owner_scope_kind = 'PROJECT' THEN EXISTS (
        SELECT 1
        FROM iam.account_project_grant AS project_grant
        JOIN project.project AS stored_project ON stored_project.project_id = project_grant.project_id
        JOIN iam.workspace_membership AS membership
          ON membership.account_id = project_grant.account_id
          AND membership.workspace_id = stored_project.workspace_id
        WHERE project_grant.account_id = p_account_id AND project_grant.project_id = p_owner_id
      )
      ELSE false
    END,
    CASE
      WHEN p_owner_scope_kind = 'WORKSPACE' THEN EXISTS (
        SELECT 1 FROM iam.workspace_membership AS membership
        WHERE membership.account_id = p_account_id AND membership.workspace_id = p_owner_id
          AND membership.can_qualify_connection
        FOR SHARE
      )
      WHEN p_owner_scope_kind = 'PROJECT' THEN EXISTS (
        SELECT 1
        FROM iam.account_project_grant AS project_grant
        JOIN project.project AS stored_project ON stored_project.project_id = project_grant.project_id
        JOIN iam.workspace_membership AS membership
          ON membership.account_id = project_grant.account_id
          AND membership.workspace_id = stored_project.workspace_id
        WHERE project_grant.account_id = p_account_id AND project_grant.project_id = p_owner_id
          AND project_grant.can_qualify_connection
        FOR SHARE OF project_grant, membership
      )
      ELSE false
    END;
$$;

-- Purpose-bound CON-03 selection admits only the exact Project binding job.
-- The requested owner scope must be that Project or its containing Workspace;
-- the account must have the current Project grant plus Workspace membership.
-- Specialist facts remain independent of generic connection.read.
CREATE FUNCTION iam.admit_connection_selection(
  p_account_id uuid,
  p_project_id uuid,
  p_owner_scope_kind text,
  p_owner_id uuid
) RETURNS TABLE(
  project_id uuid,
  workspace_id uuid,
  scope_exists boolean,
  permitted boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT target.project_id, target.workspace_id,
    target.owner_scope_matches
      AND project_grant.account_id IS NOT NULL
      AND membership.account_id IS NOT NULL,
    target.owner_scope_matches
      AND project_grant.account_id IS NOT NULL
      AND membership.account_id IS NOT NULL
      AND project_grant.can_manage
      AND project_grant.can_use_connection
  FROM (
    SELECT stored_project.project_id, stored_project.workspace_id,
      (
        (p_owner_scope_kind = 'PROJECT' AND p_owner_id = stored_project.project_id)
        OR (p_owner_scope_kind = 'WORKSPACE' AND p_owner_id = stored_project.workspace_id)
      ) AS owner_scope_matches
    FROM project.project AS stored_project
    WHERE stored_project.project_id = p_project_id
  ) AS target
  LEFT JOIN iam.account_project_grant AS project_grant
    ON project_grant.account_id = p_account_id
    AND project_grant.project_id = target.project_id
  LEFT JOIN iam.workspace_membership AS membership
    ON membership.account_id = p_account_id
    AND membership.workspace_id = target.workspace_id;
$$;

REVOKE EXECUTE ON FUNCTION iam.admit_brain_read(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.admit_any_connection_read(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.admit_connection_read(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.admit_connection_manage(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.admit_connection_qualify(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.admit_connection_selection(uuid, uuid, text, uuid) FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE workspace_owner;
GRANT USAGE ON SCHEMA workspace TO registry_owner, connections_owner;
GRANT REFERENCES ON workspace.workspace TO registry_owner, connections_owner;
RESET ROLE;

SET LOCAL ROLE project_owner;
GRANT USAGE ON SCHEMA project TO connections_owner;
GRANT REFERENCES ON project.project TO connections_owner;
RESET ROLE;

SET LOCAL ROLE registry_owner;

CREATE TABLE reg.artifact (
  artifact_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspace.workspace(workspace_id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind = 'brain'),
  semantic_name text NOT NULL CHECK (semantic_name ~ '\S'),
  published_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id, kind)
);

CREATE TABLE reg.artifact_revision (
  artifact_revision_id uuid PRIMARY KEY,
  artifact_id uuid NOT NULL REFERENCES reg.artifact(artifact_id) ON DELETE RESTRICT,
  source_revision text NOT NULL CHECK (source_revision ~ '\S'),
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  availability text NOT NULL CHECK (availability = 'AVAILABLE'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (artifact_id, source_revision),
  UNIQUE (artifact_id, digest),
  UNIQUE (artifact_id, artifact_revision_id)
);

ALTER TABLE reg.artifact
  ADD CONSTRAINT artifact_published_revision_fkey
  FOREIGN KEY (artifact_id, published_revision_id)
  REFERENCES reg.artifact_revision(artifact_id, artifact_revision_id)
  ON DELETE RESTRICT;

CREATE FUNCTION reg.bootstrap_workspace_brain(
  p_artifact_id uuid,
  p_workspace_id uuid,
  p_brain_revision_id uuid,
  p_source_revision text,
  p_brain_digest text,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored_artifact reg.artifact%ROWTYPE;
  stored_revision reg.artifact_revision%ROWTYPE;
BEGIN
  INSERT INTO reg.artifact (artifact_id, workspace_id, kind, semantic_name)
  VALUES (p_artifact_id, p_workspace_id, 'brain', 'Canonical Workspace Brain')
  ON CONFLICT (workspace_id, kind) DO NOTHING;

  SELECT * INTO STRICT stored_artifact
  FROM reg.artifact AS artifact
  WHERE artifact.workspace_id = p_workspace_id AND artifact.kind = 'brain'
  FOR UPDATE;

  IF stored_artifact.artifact_id <> p_artifact_id THEN
    RAISE EXCEPTION 'BRAIN_ARTIFACT_IDENTITY_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO reg.artifact_revision (
    artifact_revision_id, artifact_id, source_revision, digest, payload, availability
  ) VALUES (
    p_brain_revision_id, p_artifact_id, p_source_revision, p_brain_digest, p_payload, 'AVAILABLE'
  ) ON CONFLICT (artifact_id, source_revision) DO NOTHING;

  SELECT * INTO STRICT stored_revision
  FROM reg.artifact_revision AS revision
  WHERE revision.artifact_id = p_artifact_id
    AND revision.source_revision = p_source_revision;

  IF stored_revision.artifact_revision_id <> p_brain_revision_id
    OR stored_revision.digest <> p_brain_digest
    OR stored_revision.payload <> p_payload
    OR stored_revision.availability <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'BRAIN_REVISION_IDENTITY_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  IF stored_artifact.published_revision_id IS NULL THEN
    UPDATE reg.artifact
    SET published_revision_id = p_brain_revision_id
    WHERE artifact_id = p_artifact_id AND published_revision_id IS NULL;
  ELSIF stored_artifact.published_revision_id <> p_brain_revision_id THEN
    RAISE EXCEPTION 'BRAIN_PUBLICATION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE FUNCTION reg.get_workspace_brain(
  p_workspace_id uuid,
  p_admitted_workspace_ids uuid[]
) RETURNS TABLE(workspace_id uuid, published_brain_revision_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT artifact.workspace_id, artifact.published_revision_id
  FROM reg.artifact AS artifact
  WHERE artifact.workspace_id = p_workspace_id
    AND artifact.workspace_id = ANY(p_admitted_workspace_ids)
    AND artifact.kind = 'brain';
$$;

CREATE FUNCTION reg.list_brain_revisions(
  p_workspace_id uuid,
  p_admitted_workspace_ids uuid[]
) RETURNS TABLE(
  brain_revision_id uuid,
  brain_digest text,
  source_revision text,
  availability text,
  payload jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT revision.artifact_revision_id, revision.digest, revision.source_revision,
    revision.availability, revision.payload, revision.created_at
  FROM reg.artifact AS artifact
  JOIN reg.artifact_revision AS revision ON revision.artifact_id = artifact.artifact_id
  WHERE artifact.workspace_id = p_workspace_id
    AND artifact.workspace_id = ANY(p_admitted_workspace_ids)
    AND artifact.kind = 'brain'
  ORDER BY revision.created_at DESC, revision.artifact_revision_id DESC;
$$;

CREATE FUNCTION reg.get_brain_revision(
  p_workspace_id uuid,
  p_brain_revision_id uuid,
  p_admitted_workspace_ids uuid[]
) RETURNS TABLE(
  brain_revision_id uuid,
  brain_digest text,
  source_revision text,
  availability text,
  payload jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT revision.artifact_revision_id, revision.digest, revision.source_revision,
    revision.availability, revision.payload
  FROM reg.artifact AS artifact
  JOIN reg.artifact_revision AS revision ON revision.artifact_id = artifact.artifact_id
  WHERE artifact.workspace_id = p_workspace_id
    AND artifact.workspace_id = ANY(p_admitted_workspace_ids)
    AND artifact.kind = 'brain'
    AND revision.artifact_revision_id = p_brain_revision_id;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA reg FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reg.bootstrap_workspace_brain(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reg.get_workspace_brain(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reg.list_brain_revisions(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reg.get_brain_revision(uuid, uuid, uuid[]) FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE brain_owner;

CREATE TABLE brn.health (
  health_snapshot_digest text PRIMARY KEY CHECK (health_snapshot_digest ~ '^[a-f0-9]{64}$'),
  brain_revision_id uuid NOT NULL,
  brain_digest text NOT NULL CHECK (brain_digest ~ '^[a-f0-9]{64}$'),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  checked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE brn.binding_validation (
  binding_validation_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  brain_revision_id uuid NOT NULL,
  brain_digest text NOT NULL CHECK (brain_digest ~ '^[a-f0-9]{64}$'),
  project_binding_digest text NOT NULL CHECK (project_binding_digest ~ '^[a-f0-9]{64}$'),
  validation_state text NOT NULL CHECK (validation_state ~ '\S'),
  validated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (project_id, project_binding_digest)
);

CREATE FUNCTION brn.bootstrap_brain_health(
  p_health_snapshot_digest text,
  p_brain_revision_id uuid,
  p_brain_digest text,
  p_items jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored_health brn.health%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_items) <> 'array'
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) AS element(value)
      WHERE jsonb_typeof(element.value) <> 'object'
        OR NOT (element.value ?& ARRAY['semanticRef', 'state', 'critical'])
        OR jsonb_typeof(element.value->'semanticRef') <> 'string'
        OR element.value->>'semanticRef' !~ '\S'
        OR jsonb_typeof(element.value->'state') <> 'string'
        OR element.value->>'state' NOT IN ('UNVERIFIED', 'VALID', 'SUSPECT', 'INVALID', 'CHECK_ERROR')
        OR jsonb_typeof(element.value->'critical') <> 'boolean'
        OR (SELECT count(*) FROM jsonb_object_keys(element.value)) <> 3
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) AS element(value)
      GROUP BY element.value->>'semanticRef'
      HAVING count(*) > 1
    ) THEN
    RAISE EXCEPTION 'BRAIN_HEALTH_ITEMS_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  -- P2 owns one initial health settlement, not the later health-probe
  -- transition. Serialize the exact revision and reject a different replay.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_brain_revision_id::text, 3202));
  IF EXISTS (
    SELECT 1 FROM brn.health AS health
    WHERE health.brain_revision_id = p_brain_revision_id
      AND (health.health_snapshot_digest <> p_health_snapshot_digest
        OR health.brain_digest <> p_brain_digest
        OR health.items <> p_items)
  ) THEN
    RAISE EXCEPTION 'BRAIN_HEALTH_IDENTITY_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO brn.health (
    health_snapshot_digest, brain_revision_id, brain_digest, items
  ) VALUES (
    p_health_snapshot_digest, p_brain_revision_id, p_brain_digest, p_items
  ) ON CONFLICT (health_snapshot_digest) DO NOTHING;

  SELECT * INTO STRICT stored_health
  FROM brn.health AS health
  WHERE health.health_snapshot_digest = p_health_snapshot_digest;

  IF stored_health.brain_revision_id <> p_brain_revision_id
    OR stored_health.brain_digest <> p_brain_digest
    OR stored_health.items <> p_items THEN
    RAISE EXCEPTION 'BRAIN_HEALTH_IDENTITY_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE FUNCTION brn.get_brain_health(p_brain_revision_id uuid, p_brain_digest text)
RETURNS TABLE(
  brain_revision_id uuid,
  brain_digest text,
  health_snapshot_digest text,
  items jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT health.brain_revision_id, health.brain_digest,
    health.health_snapshot_digest, health.items
  FROM brn.health AS health
  WHERE health.brain_revision_id = p_brain_revision_id
    AND health.brain_digest = p_brain_digest
  ORDER BY health.checked_at DESC, health.health_snapshot_digest DESC
  LIMIT 1;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA brn FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION brn.bootstrap_brain_health(text, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION brn.get_brain_health(uuid, text) FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE connections_owner;

CREATE TABLE con.connection (
  connection_id uuid PRIMARY KEY,
  owner_scope_kind text NOT NULL CHECK (owner_scope_kind IN ('WORKSPACE', 'PROJECT')),
  workspace_id uuid REFERENCES workspace.workspace(workspace_id) ON DELETE RESTRICT,
  project_id uuid REFERENCES project.project(project_id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (name ~ '\S'),
  current_revision_id uuid,
  credential_generation bigint CHECK (credential_generation > 0),
  credential_generation_high_watermark bigint NOT NULL DEFAULT 0
    CHECK (credential_generation_high_watermark >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (credential_generation IS NULL OR credential_generation <= credential_generation_high_watermark),
  CHECK (
    (owner_scope_kind = 'WORKSPACE' AND workspace_id IS NOT NULL AND project_id IS NULL)
    OR (owner_scope_kind = 'PROJECT' AND workspace_id IS NULL AND project_id IS NOT NULL)
  )
);

CREATE TABLE con.connection_revision (
  connection_revision_id uuid PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES con.connection(connection_id) ON DELETE RESTRICT,
  connector_definition_id text NOT NULL CHECK (connector_definition_id ~ '\S'),
  connector_version text NOT NULL CHECK (connector_version ~ '\S'),
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  configuration_digest text NOT NULL CHECK (configuration_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (connection_id, connection_revision_id)
);

ALTER TABLE con.connection
  ADD CONSTRAINT connection_current_revision_fkey
  FOREIGN KEY (connection_id, current_revision_id)
  REFERENCES con.connection_revision(connection_id, connection_revision_id)
  ON DELETE RESTRICT;

CREATE TABLE con.connection_qualification (
  qualification_id uuid PRIMARY KEY,
  connection_id uuid NOT NULL,
  connection_revision_id uuid NOT NULL,
  credential_generation bigint CHECK (credential_generation > 0),
  environment text NOT NULL CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  qualification_state text CHECK (qualification_state ~ '\S'),
  outcome text CHECK (outcome IN ('PASSED', 'FAILED', 'INDETERMINATE')),
  diagnostic jsonb,
  evidence_refs text[],
  tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (connection_id, connection_revision_id)
    REFERENCES con.connection_revision(connection_id, connection_revision_id)
    ON DELETE RESTRICT,
  UNIQUE (connection_id, qualification_id),
  CHECK (
    (qualification_state IS NULL AND outcome IS NULL AND diagnostic IS NULL
      AND evidence_refs IS NULL AND tested_at IS NULL)
    OR
    (qualification_state IS NOT NULL AND outcome IS NOT NULL AND diagnostic IS NOT NULL
      AND evidence_refs IS NOT NULL AND cardinality(evidence_refs) > 0 AND tested_at IS NOT NULL)
  )
);

-- Owner-local repeatable-intake mechanics. This is not a generic Product
-- idempotency owner and carries no secret bytes or response payload.
CREATE TABLE con.operation_receipt (
  operation_id text NOT NULL CHECK (operation_id IN ('CON-05', 'CON-07', 'CON-08')),
  account_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  key_digest text NOT NULL CHECK (key_digest ~ '^[a-f0-9]{64}$'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  reserved_connection_id uuid NOT NULL,
  reserved_revision_id uuid,
  reserved_generation bigint CHECK (reserved_generation > 0),
  reserved_qualification_id uuid,
  reservation_owner uuid,
  lease_expires_at timestamptz,
  settlement_state text NOT NULL CHECK (settlement_state IN ('RESERVED', 'SETTLED', 'ABANDONED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (operation_id, account_id, subject_id, key_digest),
  CHECK (
    (operation_id = 'CON-05' AND reserved_revision_id IS NOT NULL
      AND reserved_generation IS NULL AND reserved_qualification_id IS NULL
      AND reservation_owner IS NULL AND lease_expires_at IS NULL
      AND settlement_state = 'SETTLED' AND completed_at IS NOT NULL)
    OR
    (operation_id = 'CON-07' AND subject_id = reserved_connection_id
      AND reserved_revision_id IS NULL AND reserved_generation IS NOT NULL
      AND reserved_qualification_id IS NULL
      AND reservation_owner IS NULL AND lease_expires_at IS NULL)
    OR
    (operation_id = 'CON-08' AND subject_id = reserved_connection_id
      AND reserved_revision_id IS NOT NULL AND reserved_generation IS NOT NULL
      AND reserved_qualification_id IS NOT NULL
      AND reservation_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CHECK ((settlement_state = 'RESERVED' AND completed_at IS NULL)
    OR (settlement_state IN ('SETTLED', 'ABANDONED') AND completed_at IS NOT NULL)),
  CHECK (settlement_state <> 'ABANDONED' OR operation_id = 'CON-07')
);

CREATE UNIQUE INDEX operation_receipt_reserved_connection_id_key
  ON con.operation_receipt (reserved_connection_id)
  WHERE operation_id = 'CON-05';
CREATE UNIQUE INDEX operation_receipt_reserved_revision_id_key
  ON con.operation_receipt (reserved_revision_id)
  WHERE operation_id = 'CON-05';
CREATE UNIQUE INDEX operation_receipt_reserved_qualification_id_key
  ON con.operation_receipt (reserved_qualification_id)
  WHERE operation_id = 'CON-08';

CREATE FUNCTION con.list_connections(
  p_account_id uuid,
  p_owner_scope_kind text,
  p_owner_id uuid,
  p_for_project_id uuid DEFAULT NULL
) RETURNS TABLE(
  connection_id uuid,
  name text,
  owner_scope_kind text,
  owner_id uuid,
  connector_definition_id text,
  connector_version text,
  current_revision_id uuid,
  credential_configured boolean,
  test_state text,
  qualification_id uuid,
  test_environment text,
  tested_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  admission record;
BEGIN
  IF p_for_project_id IS NULL THEN
    SELECT * INTO STRICT admission
    FROM iam.admit_connection_read(p_account_id, p_owner_scope_kind, p_owner_id);
    IF NOT admission.scope_exists THEN
      RAISE EXCEPTION 'CONNECTION_SCOPE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF NOT admission.permitted THEN
      RAISE EXCEPTION 'CONNECTION_READ_DENIED' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT * INTO admission
    FROM iam.admit_connection_selection(
      p_account_id, p_for_project_id, p_owner_scope_kind, p_owner_id
    );
    IF NOT FOUND OR NOT admission.scope_exists THEN
      RAISE EXCEPTION 'CONNECTION_SCOPE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF NOT admission.permitted THEN
      RAISE EXCEPTION 'CONNECTION_SELECTION_DENIED' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT stored_connection.connection_id, stored_connection.name,
    stored_connection.owner_scope_kind,
    CASE WHEN stored_connection.owner_scope_kind = 'WORKSPACE'
      THEN stored_connection.workspace_id ELSE stored_connection.project_id END,
    revision.connector_definition_id, revision.connector_version,
    stored_connection.current_revision_id,
    stored_connection.credential_generation IS NOT NULL,
    CASE
      WHEN qualification.qualification_id IS NULL THEN 'NOT_TESTED'
      WHEN qualification.connection_revision_id = stored_connection.current_revision_id
        AND qualification.credential_generation IS NOT DISTINCT FROM stored_connection.credential_generation
        THEN qualification.outcome
      ELSE 'NEEDS_RETEST'
    END,
    qualification.qualification_id, qualification.environment, qualification.tested_at
  FROM con.connection AS stored_connection
  JOIN con.connection_revision AS revision
    ON revision.connection_id = stored_connection.connection_id
    AND revision.connection_revision_id = stored_connection.current_revision_id
  LEFT JOIN LATERAL (
    SELECT candidate.qualification_id, candidate.connection_revision_id,
      candidate.credential_generation, candidate.environment, candidate.outcome, candidate.tested_at
    FROM con.connection_qualification AS candidate
    WHERE candidate.connection_id = stored_connection.connection_id
      AND candidate.tested_at IS NOT NULL
    ORDER BY candidate.tested_at DESC, candidate.qualification_id DESC
    LIMIT 1
  ) AS qualification ON true
  WHERE stored_connection.owner_scope_kind = p_owner_scope_kind
    AND ((p_owner_scope_kind = 'WORKSPACE' AND stored_connection.workspace_id = p_owner_id)
      OR (p_owner_scope_kind = 'PROJECT' AND stored_connection.project_id = p_owner_id))
  ORDER BY stored_connection.name, stored_connection.connection_id;
END;
$$;

CREATE FUNCTION con.get_project_binding_name(
  p_project_id uuid,
  p_workspace_id uuid,
  p_connection_id uuid
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored_name text;
BEGIN
  IF p_project_id IS NULL OR p_workspace_id IS NULL OR p_connection_id IS NULL THEN
    RAISE EXCEPTION 'PROJECT_BINDING_INPUT_REFUSED' USING ERRCODE = '22023';
  END IF;

  SELECT candidate.name INTO stored_name
  FROM con.connection AS candidate
  WHERE candidate.connection_id = p_connection_id
    AND ((candidate.owner_scope_kind = 'WORKSPACE' AND candidate.workspace_id = p_workspace_id)
      OR (candidate.owner_scope_kind = 'PROJECT' AND candidate.project_id = p_project_id));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_BINDING_CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  RETURN stored_name;
END;
$$;

CREATE FUNCTION con.admit_project_binding_revision(
  p_project_id uuid,
  p_workspace_id uuid,
  p_connection_id uuid,
  p_connection_revision_id uuid,
  p_environment text
) RETURNS TABLE(qualification_id uuid, connection_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  subject con.connection%ROWTYPE;
  revision con.connection_revision%ROWTYPE;
  latest_qualification con.connection_qualification%ROWTYPE;
BEGIN
  IF p_project_id IS NULL OR p_workspace_id IS NULL OR p_connection_id IS NULL
    OR p_connection_revision_id IS NULL OR p_environment IS NULL
    OR p_environment NOT IN ('SANDBOX', 'PRODUCTION') THEN
    RAISE EXCEPTION 'PROJECT_BINDING_INPUT_REFUSED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO subject
  FROM con.connection AS candidate
  WHERE candidate.connection_id = p_connection_id
    AND ((candidate.owner_scope_kind = 'WORKSPACE' AND candidate.workspace_id = p_workspace_id)
      OR (candidate.owner_scope_kind = 'PROJECT' AND candidate.project_id = p_project_id))
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_BINDING_CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF subject.current_revision_id IS NULL OR subject.credential_generation IS NULL THEN
    RAISE EXCEPTION 'PROJECT_BINDING_REVISION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO revision
  FROM con.connection_revision AS candidate
  WHERE candidate.connection_id = p_connection_id
    AND candidate.connection_revision_id = p_connection_revision_id;
  IF NOT FOUND OR revision.connection_revision_id <> subject.current_revision_id
    OR revision.configuration->>'environment' IS DISTINCT FROM p_environment THEN
    RAISE EXCEPTION 'PROJECT_BINDING_REVISION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF revision.connector_definition_id <> 'sankhya-om'
    OR revision.connector_version <> '1.0.0' THEN
    RAISE EXCEPTION 'PROJECT_BINDING_REVISION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO latest_qualification
  FROM con.connection_qualification AS candidate
  WHERE candidate.connection_id = p_connection_id
    AND candidate.tested_at IS NOT NULL
  ORDER BY candidate.tested_at DESC, candidate.qualification_id DESC
  LIMIT 1;
  IF NOT FOUND OR latest_qualification.outcome <> 'PASSED'
    OR latest_qualification.connection_revision_id <> subject.current_revision_id
    OR latest_qualification.connection_revision_id <> p_connection_revision_id
    OR latest_qualification.credential_generation IS DISTINCT FROM subject.credential_generation
    OR latest_qualification.environment IS DISTINCT FROM p_environment THEN
    RAISE EXCEPTION 'PROJECT_BINDING_REVISION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY SELECT latest_qualification.qualification_id, subject.name;
END;
$$;

CREATE FUNCTION con.get_connection(
  p_account_id uuid,
  p_connection_id uuid
) RETURNS TABLE(
  connection_id uuid,
  name text,
  owner_scope_kind text,
  owner_id uuid,
  connector_definition_id text,
  connector_version text,
  current_revision_id uuid,
  credential_configured boolean,
  configuration jsonb,
  test_state text,
  qualification_id uuid,
  test_environment text,
  tested_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  subject con.connection%ROWTYPE;
  admission record;
  subject_owner_id uuid;
BEGIN
  SELECT * INTO subject FROM con.connection AS candidate
  WHERE candidate.connection_id = p_connection_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  subject_owner_id := CASE WHEN subject.owner_scope_kind = 'WORKSPACE'
    THEN subject.workspace_id ELSE subject.project_id END;
  SELECT * INTO STRICT admission
  FROM iam.admit_connection_read(p_account_id, subject.owner_scope_kind, subject_owner_id);
  IF NOT admission.scope_exists THEN
    RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT admission.permitted THEN
    RAISE EXCEPTION 'CONNECTION_READ_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT subject.connection_id, subject.name, subject.owner_scope_kind, subject_owner_id,
    revision.connector_definition_id, revision.connector_version, subject.current_revision_id,
    subject.credential_generation IS NOT NULL, revision.configuration,
    CASE
      WHEN qualification.qualification_id IS NULL THEN 'NOT_TESTED'
      WHEN qualification.connection_revision_id = subject.current_revision_id
        AND qualification.credential_generation IS NOT DISTINCT FROM subject.credential_generation
        THEN qualification.outcome
      ELSE 'NEEDS_RETEST'
    END,
    qualification.qualification_id, qualification.environment, qualification.tested_at
  FROM con.connection_revision AS revision
  LEFT JOIN LATERAL (
    SELECT candidate.qualification_id, candidate.connection_revision_id,
      candidate.credential_generation, candidate.environment, candidate.outcome, candidate.tested_at
    FROM con.connection_qualification AS candidate
    WHERE candidate.connection_id = subject.connection_id AND candidate.tested_at IS NOT NULL
    ORDER BY candidate.tested_at DESC, candidate.qualification_id DESC
    LIMIT 1
  ) AS qualification ON true
  WHERE revision.connection_id = subject.connection_id
    AND revision.connection_revision_id = subject.current_revision_id;
END;
$$;

CREATE FUNCTION con.create_or_replay_connection(
  p_account_id uuid,
  p_owner_scope_kind text,
  p_owner_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_connection_id uuid,
  p_connection_revision_id uuid,
  p_name text,
  p_connector_definition_id text,
  p_connector_version text,
  p_configuration jsonb,
  p_configuration_digest text
) RETURNS TABLE(connection_id uuid, connection_revision_id uuid, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  admission record;
  receipt con.operation_receipt%ROWTYPE;
  inserted_count bigint;
BEGIN
  IF p_owner_scope_kind NOT IN ('WORKSPACE', 'PROJECT') THEN
    RAISE EXCEPTION 'CONNECTION_SCOPE_REFUSED' USING ERRCODE = '22023';
  END IF;
  IF p_connector_definition_id <> 'sankhya-om' OR p_connector_version <> '1.0.0'
    OR jsonb_typeof(p_configuration) <> 'object'
    OR NOT (p_configuration ?& ARRAY['environment', 'companyCode'])
    OR (SELECT count(*) FROM jsonb_object_keys(p_configuration)) <> 2
    OR p_configuration->>'environment' NOT IN ('SANDBOX', 'PRODUCTION')
    OR jsonb_typeof(p_configuration->'companyCode') <> 'number'
    OR p_configuration->>'companyCode' !~ '^[1-9][0-9]*$'
    OR (CASE WHEN p_configuration->>'companyCode' ~ '^[1-9][0-9]*$'
      THEN (p_configuration->>'companyCode')::numeric > 2147483647 ELSE false END) THEN
    RAISE EXCEPTION 'CONNECTION_CONFIGURATION_REFUSED' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT admission
  FROM iam.admit_connection_manage(p_account_id, p_owner_scope_kind, p_owner_id);
  IF NOT admission.scope_exists THEN
    RAISE EXCEPTION 'CONNECTION_SCOPE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT admission.permitted THEN
    RAISE EXCEPTION 'CONNECTION_MANAGE_DENIED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO con.operation_receipt (
    operation_id, account_id, subject_id, key_digest, request_digest,
    reserved_connection_id, reserved_revision_id, settlement_state, completed_at
  ) VALUES (
    'CON-05', p_account_id, p_owner_id, p_key_digest, p_request_digest,
    p_connection_id, p_connection_revision_id, 'SETTLED', clock_timestamp()
  ) ON CONFLICT (operation_id, account_id, subject_id, key_digest) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  SELECT * INTO STRICT receipt FROM con.operation_receipt
  WHERE operation_id = 'CON-05' AND account_id = p_account_id
    AND subject_id = p_owner_id AND key_digest = p_key_digest
  FOR UPDATE;
  IF receipt.request_digest <> p_request_digest THEN
    RAISE EXCEPTION 'CONNECTION_IDEMPOTENCY_REUSE_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  IF inserted_count > 0 THEN
    INSERT INTO con.connection (
      connection_id, owner_scope_kind, workspace_id, project_id, name
    ) VALUES (
      receipt.reserved_connection_id, p_owner_scope_kind,
      CASE WHEN p_owner_scope_kind = 'WORKSPACE' THEN p_owner_id END,
      CASE WHEN p_owner_scope_kind = 'PROJECT' THEN p_owner_id END,
      p_name
    );
    INSERT INTO con.connection_revision (
      connection_revision_id, connection_id, connector_definition_id,
      connector_version, configuration, configuration_digest
    ) VALUES (
      receipt.reserved_revision_id, receipt.reserved_connection_id,
      p_connector_definition_id, p_connector_version, p_configuration, p_configuration_digest
    );
    UPDATE con.connection SET current_revision_id = receipt.reserved_revision_id
    WHERE con.connection.connection_id = receipt.reserved_connection_id;
  END IF;

  RETURN QUERY SELECT receipt.reserved_connection_id, receipt.reserved_revision_id, inserted_count = 0;
END;
$$;

CREATE FUNCTION con.revise_connection(
  p_account_id uuid,
  p_connection_id uuid,
  p_expected_current_revision_id uuid,
  p_connection_revision_id uuid,
  p_configuration jsonb,
  p_configuration_digest text
) RETURNS TABLE(
  connection_id uuid,
  connection_revision_id uuid,
  connector_definition_id text,
  connector_version text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  subject con.connection%ROWTYPE;
  current_revision con.connection_revision%ROWTYPE;
  admission record;
  subject_owner_id uuid;
BEGIN
  SELECT * INTO subject FROM con.connection AS candidate
  WHERE candidate.connection_id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  subject_owner_id := CASE WHEN subject.owner_scope_kind = 'WORKSPACE'
    THEN subject.workspace_id ELSE subject.project_id END;
  SELECT * INTO STRICT admission
  FROM iam.admit_connection_manage(p_account_id, subject.owner_scope_kind, subject_owner_id);
  IF NOT admission.scope_exists THEN RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT admission.permitted THEN RAISE EXCEPTION 'CONNECTION_MANAGE_DENIED' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_configuration) <> 'object'
    OR NOT (p_configuration ?& ARRAY['environment', 'companyCode'])
    OR (SELECT count(*) FROM jsonb_object_keys(p_configuration)) <> 2
    OR p_configuration->>'environment' NOT IN ('SANDBOX', 'PRODUCTION')
    OR jsonb_typeof(p_configuration->'companyCode') <> 'number'
    OR p_configuration->>'companyCode' !~ '^[1-9][0-9]*$'
    OR (CASE WHEN p_configuration->>'companyCode' ~ '^[1-9][0-9]*$'
      THEN (p_configuration->>'companyCode')::numeric > 2147483647 ELSE false END) THEN
    RAISE EXCEPTION 'CONNECTION_CONFIGURATION_REFUSED' USING ERRCODE = '22023';
  END IF;
  IF subject.current_revision_id <> p_expected_current_revision_id THEN
    RAISE EXCEPTION 'CONNECTION_CURRENT_REVISION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO STRICT current_revision FROM con.connection_revision AS revision
  WHERE revision.connection_id = subject.connection_id
    AND revision.connection_revision_id = subject.current_revision_id;
  IF current_revision.configuration_digest = p_configuration_digest
    AND current_revision.configuration = p_configuration THEN
    RAISE EXCEPTION 'CONNECTION_REVISION_NO_CHANGE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO con.connection_revision (
    connection_revision_id, connection_id, connector_definition_id,
    connector_version, configuration, configuration_digest
  ) VALUES (
    p_connection_revision_id, subject.connection_id, current_revision.connector_definition_id,
    current_revision.connector_version, p_configuration, p_configuration_digest
  );
  UPDATE con.connection SET current_revision_id = p_connection_revision_id, updated_at = clock_timestamp()
  WHERE con.connection.connection_id = subject.connection_id
    AND con.connection.current_revision_id = p_expected_current_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONNECTION_CURRENT_REVISION_CONFLICT' USING ERRCODE = 'P0001'; END IF;

  RETURN QUERY SELECT subject.connection_id, p_connection_revision_id,
    current_revision.connector_definition_id, current_revision.connector_version;
END;
$$;

CREATE FUNCTION con.reserve_connection_credential(
  p_account_id uuid,
  p_connection_id uuid,
  p_key_digest text,
  p_request_digest text
) RETURNS TABLE(credential_generation bigint, settlement_state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  subject con.connection%ROWTYPE;
  admission record;
  receipt con.operation_receipt%ROWTYPE;
  pending_receipt con.operation_receipt%ROWTYPE;
  subject_owner_id uuid;
BEGIN
  SELECT * INTO subject FROM con.connection AS candidate
  WHERE candidate.connection_id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  subject_owner_id := CASE WHEN subject.owner_scope_kind = 'WORKSPACE'
    THEN subject.workspace_id ELSE subject.project_id END;
  SELECT * INTO STRICT admission
  FROM iam.admit_connection_manage(p_account_id, subject.owner_scope_kind, subject_owner_id);
  IF NOT admission.scope_exists THEN RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT admission.permitted THEN RAISE EXCEPTION 'CONNECTION_MANAGE_DENIED' USING ERRCODE = '42501'; END IF;

  SELECT * INTO receipt FROM con.operation_receipt
  WHERE operation_id = 'CON-07' AND account_id = p_account_id
    AND subject_id = p_connection_id AND key_digest = p_key_digest
  FOR UPDATE;
  IF FOUND THEN
    IF receipt.request_digest <> p_request_digest THEN
      RAISE EXCEPTION 'CONNECTION_IDEMPOTENCY_REUSE_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN QUERY SELECT receipt.reserved_generation, receipt.settlement_state;
    RETURN;
  END IF;

  SELECT * INTO pending_receipt
  FROM con.operation_receipt AS pending
  WHERE pending.operation_id = 'CON-07' AND pending.subject_id = p_connection_id
    AND pending.settlement_state = 'RESERVED'
  ORDER BY pending.created_at, pending.account_id, pending.key_digest
  LIMIT 1;
  IF FOUND AND pending_receipt.request_digest = p_request_digest THEN
    INSERT INTO con.operation_receipt (
      operation_id, account_id, subject_id, key_digest, request_digest,
      reserved_connection_id, reserved_generation, settlement_state
    ) VALUES (
      'CON-07', p_account_id, p_connection_id, p_key_digest, p_request_digest,
      p_connection_id, pending_receipt.reserved_generation, 'RESERVED'
    ) RETURNING * INTO receipt;
    RETURN QUERY SELECT receipt.reserved_generation, 'RESERVED'::text;
    RETURN;
  ELSIF FOUND THEN
    UPDATE con.operation_receipt AS pending_alias
    SET settlement_state = 'ABANDONED', completed_at = clock_timestamp()
    WHERE pending_alias.operation_id = 'CON-07' AND pending_alias.subject_id = p_connection_id
      AND pending_alias.reserved_generation = pending_receipt.reserved_generation
      AND pending_alias.settlement_state = 'RESERVED';
  END IF;

  UPDATE con.connection
  SET credential_generation_high_watermark = credential_generation_high_watermark + 1,
    updated_at = clock_timestamp()
  WHERE con.connection.connection_id = p_connection_id
  RETURNING * INTO subject;
  INSERT INTO con.operation_receipt (
    operation_id, account_id, subject_id, key_digest, request_digest,
    reserved_connection_id, reserved_generation, settlement_state
  ) VALUES (
    'CON-07', p_account_id, p_connection_id, p_key_digest, p_request_digest,
    p_connection_id, subject.credential_generation_high_watermark, 'RESERVED'
  ) RETURNING * INTO receipt;
  RETURN QUERY SELECT receipt.reserved_generation, 'NEW'::text;
END;
$$;

CREATE FUNCTION con.settle_connection_credential(
  p_account_id uuid,
  p_connection_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_credential_generation bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  subject con.connection%ROWTYPE;
  admission record;
  receipt con.operation_receipt%ROWTYPE;
  subject_owner_id uuid;
BEGIN
  SELECT * INTO subject FROM con.connection AS candidate
  WHERE candidate.connection_id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  subject_owner_id := CASE WHEN subject.owner_scope_kind = 'WORKSPACE'
    THEN subject.workspace_id ELSE subject.project_id END;
  SELECT * INTO STRICT admission
  FROM iam.admit_connection_manage(p_account_id, subject.owner_scope_kind, subject_owner_id);
  IF NOT admission.scope_exists THEN RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT admission.permitted THEN RAISE EXCEPTION 'CONNECTION_MANAGE_DENIED' USING ERRCODE = '42501'; END IF;

  SELECT * INTO receipt FROM con.operation_receipt
  WHERE operation_id = 'CON-07' AND account_id = p_account_id
    AND subject_id = p_connection_id AND key_digest = p_key_digest
  FOR UPDATE;
  IF NOT FOUND OR receipt.request_digest <> p_request_digest
    OR receipt.reserved_generation <> p_credential_generation THEN
    RAISE EXCEPTION 'CONNECTION_CREDENTIAL_RECEIPT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF receipt.settlement_state = 'ABANDONED' THEN
    RAISE EXCEPTION 'CONNECTION_CREDENTIAL_RECEIPT_ABANDONED' USING ERRCODE = 'P0001';
  END IF;
  IF receipt.settlement_state = 'SETTLED' THEN RETURN; END IF;
  IF p_credential_generation <> subject.credential_generation_high_watermark THEN
    RAISE EXCEPTION 'CONNECTION_CREDENTIAL_GENERATION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  UPDATE con.connection
  SET credential_generation = p_credential_generation, updated_at = clock_timestamp()
  WHERE con.connection.connection_id = p_connection_id
    AND con.connection.credential_generation IS NOT DISTINCT FROM subject.credential_generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONNECTION_CREDENTIAL_GENERATION_CONFLICT' USING ERRCODE = 'P0001'; END IF;
  UPDATE con.operation_receipt SET settlement_state = 'SETTLED', completed_at = clock_timestamp()
  WHERE operation_id = 'CON-07' AND subject_id = p_connection_id
    AND reserved_generation = p_credential_generation
    AND request_digest = p_request_digest
    AND settlement_state = 'RESERVED';
END;
$$;

CREATE FUNCTION con.reserve_connection_qualification(
  p_account_id uuid,
  p_connection_id uuid,
  p_connection_revision_id uuid,
  p_environment text,
  p_key_digest text,
  p_request_digest text,
  p_qualification_id uuid,
  p_attempt_id uuid
) RETURNS TABLE(
  qualification_id uuid,
  connection_revision_id uuid,
  credential_generation bigint,
  environment text,
  configuration jsonb,
  settlement_state text,
  qualification_state text,
  outcome text,
  diagnostic jsonb,
  evidence_refs text[],
  tested_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  subject con.connection%ROWTYPE;
  revision con.connection_revision%ROWTYPE;
  admission record;
  receipt con.operation_receipt%ROWTYPE;
  qualification con.connection_qualification%ROWTYPE;
  subject_owner_id uuid;
BEGIN
  SELECT * INTO subject FROM con.connection AS candidate
  WHERE candidate.connection_id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  subject_owner_id := CASE WHEN subject.owner_scope_kind = 'WORKSPACE'
    THEN subject.workspace_id ELSE subject.project_id END;
  SELECT * INTO STRICT admission
  FROM iam.admit_connection_qualify(p_account_id, subject.owner_scope_kind, subject_owner_id);
  IF NOT admission.scope_exists THEN RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT admission.permitted THEN RAISE EXCEPTION 'CONNECTION_QUALIFY_DENIED' USING ERRCODE = '42501'; END IF;
  IF subject.credential_generation IS NULL THEN
    RAISE EXCEPTION 'CONNECTION_CREDENTIAL_REQUIRED' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO revision FROM con.connection_revision AS candidate
  WHERE candidate.connection_id = p_connection_id
    AND candidate.connection_revision_id = p_connection_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONNECTION_REVISION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF revision.configuration->>'environment' IS DISTINCT FROM p_environment THEN
    RAISE EXCEPTION 'CONNECTION_ENVIRONMENT_CONFLICT' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO receipt FROM con.operation_receipt
  WHERE operation_id = 'CON-08' AND account_id = p_account_id
    AND subject_id = p_connection_id AND key_digest = p_key_digest
  FOR UPDATE;
  IF FOUND THEN
    IF receipt.request_digest <> p_request_digest THEN
      RAISE EXCEPTION 'CONNECTION_IDEMPOTENCY_REUSE_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO STRICT qualification FROM con.connection_qualification AS stored
    WHERE stored.qualification_id = receipt.reserved_qualification_id
      AND stored.connection_id = receipt.reserved_connection_id;
    SELECT * INTO STRICT revision FROM con.connection_revision AS stored
    WHERE stored.connection_revision_id = receipt.reserved_revision_id
      AND stored.connection_id = receipt.reserved_connection_id;
    IF receipt.settlement_state = 'RESERVED'
      AND receipt.lease_expires_at > clock_timestamp() THEN
      RETURN QUERY SELECT qualification.qualification_id, qualification.connection_revision_id,
        qualification.credential_generation, qualification.environment, revision.configuration,
        'IN_PROGRESS'::text, qualification.qualification_state, qualification.outcome,
        qualification.diagnostic, qualification.evidence_refs, qualification.tested_at;
      RETURN;
    END IF;
    IF receipt.settlement_state = 'RESERVED' THEN
      UPDATE con.operation_receipt AS recovering_receipt
      SET reservation_owner = p_attempt_id,
        lease_expires_at = clock_timestamp() + interval '1 minute'
      WHERE recovering_receipt.operation_id = 'CON-08'
        AND recovering_receipt.account_id = p_account_id
        AND recovering_receipt.subject_id = p_connection_id
        AND recovering_receipt.key_digest = p_key_digest
        AND recovering_receipt.settlement_state = 'RESERVED';
    END IF;
    RETURN QUERY SELECT qualification.qualification_id, qualification.connection_revision_id,
      qualification.credential_generation, qualification.environment, revision.configuration,
      CASE WHEN receipt.settlement_state = 'SETTLED' THEN 'SETTLED' ELSE 'RESERVED' END,
      qualification.qualification_state, qualification.outcome, qualification.diagnostic,
      qualification.evidence_refs, qualification.tested_at;
    RETURN;
  END IF;

  INSERT INTO con.connection_qualification (
    qualification_id, connection_id, connection_revision_id, credential_generation, environment
  ) VALUES (
    p_qualification_id, p_connection_id, p_connection_revision_id,
    subject.credential_generation, p_environment
  ) RETURNING * INTO qualification;
  INSERT INTO con.operation_receipt (
    operation_id, account_id, subject_id, key_digest, request_digest,
    reserved_connection_id, reserved_revision_id, reserved_generation,
    reserved_qualification_id, reservation_owner, lease_expires_at, settlement_state
  ) VALUES (
    'CON-08', p_account_id, p_connection_id, p_key_digest, p_request_digest,
    p_connection_id, p_connection_revision_id, subject.credential_generation,
    p_qualification_id, p_attempt_id, clock_timestamp() + interval '1 minute', 'RESERVED'
  );
  RETURN QUERY SELECT qualification.qualification_id, qualification.connection_revision_id,
    qualification.credential_generation, qualification.environment, revision.configuration,
    'NEW'::text, NULL::text, NULL::text, NULL::jsonb, NULL::text[], NULL::timestamptz;
END;
$$;

CREATE FUNCTION con.settle_connection_qualification(
  p_account_id uuid,
  p_connection_id uuid,
  p_qualification_id uuid,
  p_connection_revision_id uuid,
  p_credential_generation bigint,
  p_environment text,
  p_attempt_id uuid,
  p_qualification_state text,
  p_outcome text,
  p_diagnostic jsonb,
  p_evidence_refs text[],
  p_tested_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  subject con.connection%ROWTYPE;
  admission record;
  receipt con.operation_receipt%ROWTYPE;
  qualification con.connection_qualification%ROWTYPE;
  subject_owner_id uuid;
BEGIN
  IF p_qualification_state IS NULL OR p_qualification_state !~ '\S'
    OR p_outcome NOT IN ('PASSED', 'FAILED', 'INDETERMINATE')
    OR jsonb_typeof(p_diagnostic) <> 'object'
    OR jsonb_typeof(p_diagnostic->'title') <> 'string'
    OR p_diagnostic->>'title' !~ '\S'
    OR jsonb_typeof(p_diagnostic->'message') <> 'string'
    OR p_diagnostic->>'message' !~ '\S'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_diagnostic) AS key(name)
      WHERE key.name NOT IN ('title', 'message', 'remediation'))
    OR (p_diagnostic ? 'remediation' AND (
      jsonb_typeof(p_diagnostic->'remediation') <> 'string'
      OR p_diagnostic->>'remediation' !~ '\S'))
    OR cardinality(p_evidence_refs) < 1
    OR EXISTS (SELECT 1 FROM unnest(p_evidence_refs) AS evidence(ref)
      WHERE evidence.ref IS NULL OR evidence.ref !~ '\S')
    OR EXISTS (SELECT 1 FROM unnest(p_evidence_refs) AS evidence(ref)
      GROUP BY evidence.ref HAVING count(*) > 1)
    OR p_tested_at IS NULL THEN
    RAISE EXCEPTION 'CONNECTION_QUALIFICATION_RESULT_REFUSED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO subject FROM con.connection AS candidate
  WHERE candidate.connection_id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  subject_owner_id := CASE WHEN subject.owner_scope_kind = 'WORKSPACE'
    THEN subject.workspace_id ELSE subject.project_id END;
  SELECT * INTO STRICT admission
  FROM iam.admit_connection_qualify(p_account_id, subject.owner_scope_kind, subject_owner_id);
  IF NOT admission.scope_exists THEN RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT admission.permitted THEN RAISE EXCEPTION 'CONNECTION_QUALIFY_DENIED' USING ERRCODE = '42501'; END IF;

  SELECT * INTO receipt FROM con.operation_receipt
  WHERE operation_id = 'CON-08' AND account_id = p_account_id
    AND subject_id = p_connection_id AND reserved_qualification_id = p_qualification_id
  FOR UPDATE;
  IF NOT FOUND OR receipt.reserved_revision_id <> p_connection_revision_id
    OR receipt.reserved_generation <> p_credential_generation
    OR receipt.reservation_owner <> p_attempt_id THEN
    RAISE EXCEPTION 'CONNECTION_QUALIFICATION_RECEIPT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO STRICT qualification FROM con.connection_qualification AS stored
  WHERE stored.qualification_id = p_qualification_id AND stored.connection_id = p_connection_id
  FOR UPDATE;
  IF qualification.connection_revision_id <> p_connection_revision_id
    OR qualification.credential_generation <> p_credential_generation
    OR qualification.environment <> p_environment THEN
    RAISE EXCEPTION 'CONNECTION_QUALIFICATION_BASIS_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF receipt.settlement_state = 'SETTLED' THEN
    IF qualification.qualification_state <> p_qualification_state
      OR qualification.outcome <> p_outcome
      OR qualification.diagnostic <> p_diagnostic
      OR qualification.evidence_refs <> p_evidence_refs
      OR qualification.tested_at <> p_tested_at THEN
      RAISE EXCEPTION 'CONNECTION_QUALIFICATION_SETTLEMENT_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN;
  END IF;

  UPDATE con.connection_qualification
  SET qualification_state = p_qualification_state, outcome = p_outcome,
    diagnostic = p_diagnostic, evidence_refs = p_evidence_refs, tested_at = p_tested_at
  WHERE con.connection_qualification.qualification_id = p_qualification_id
    AND con.connection_qualification.qualification_state IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONNECTION_QUALIFICATION_SETTLEMENT_CONFLICT' USING ERRCODE = 'P0001'; END IF;
  UPDATE con.operation_receipt SET settlement_state = 'SETTLED', completed_at = clock_timestamp()
  WHERE operation_id = 'CON-08' AND account_id = p_account_id
    AND subject_id = p_connection_id AND reserved_qualification_id = p_qualification_id
    AND reservation_owner = p_attempt_id
    AND settlement_state = 'RESERVED';
END;
$$;

CREATE FUNCTION con.get_connection_qualification(
  p_account_id uuid,
  p_connection_id uuid,
  p_qualification_id uuid
) RETURNS TABLE(
  qualification_id uuid,
  connection_id uuid,
  connection_revision_id uuid,
  credential_generation bigint,
  environment text,
  qualification_state text,
  outcome text,
  tested_at timestamptz,
  diagnostic jsonb,
  evidence_refs text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  subject con.connection%ROWTYPE;
  admission record;
  subject_owner_id uuid;
BEGIN
  SELECT * INTO subject FROM con.connection AS candidate
  WHERE candidate.connection_id = p_connection_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  subject_owner_id := CASE WHEN subject.owner_scope_kind = 'WORKSPACE'
    THEN subject.workspace_id ELSE subject.project_id END;
  SELECT * INTO STRICT admission
  FROM iam.admit_connection_read(p_account_id, subject.owner_scope_kind, subject_owner_id);
  IF NOT admission.scope_exists THEN RAISE EXCEPTION 'CONNECTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT admission.permitted THEN RAISE EXCEPTION 'CONNECTION_READ_DENIED' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
  SELECT qualification.qualification_id, qualification.connection_id,
    qualification.connection_revision_id, qualification.credential_generation,
    qualification.environment, qualification.qualification_state,
    qualification.outcome, qualification.tested_at, qualification.diagnostic,
    qualification.evidence_refs
  FROM con.connection_qualification AS qualification
  WHERE qualification.connection_id = p_connection_id
    AND qualification.qualification_id = p_qualification_id
    AND qualification.tested_at IS NOT NULL;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA con FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION con.list_connections(uuid, text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION con.get_connection(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION con.create_or_replay_connection(uuid, text, uuid, text, text, uuid, uuid, text, text, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION con.revise_connection(uuid, uuid, uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION con.reserve_connection_credential(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION con.settle_connection_credential(uuid, uuid, text, text, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION con.reserve_connection_qualification(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION con.settle_connection_qualification(uuid, uuid, uuid, uuid, bigint, text, uuid, text, text, jsonb, text[], timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION con.get_connection_qualification(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION con.get_project_binding_name(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION con.admit_project_binding_revision(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE project_owner;

CREATE TABLE project.brain_binding (
  project_id uuid PRIMARY KEY REFERENCES project.project(project_id) ON DELETE RESTRICT,
  brain_revision_id uuid NOT NULL,
  brain_digest text NOT NULL CHECK (brain_digest ~ '^[a-f0-9]{64}$'),
  project_binding_digest text NOT NULL CHECK (project_binding_digest ~ '^[a-f0-9]{64}$'),
  validation_state text NOT NULL CHECK (validation_state ~ '\S'),
  project_source_revision text NOT NULL CHECK (project_source_revision ~ '\S'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE project.connection_binding (
  project_id uuid NOT NULL REFERENCES project.project(project_id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL,
  connection_revision_id uuid NOT NULL,
  qualification_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  binding_digest text NOT NULL CHECK (binding_digest ~ '^[a-f0-9]{64}$'),
  project_source_revision text NOT NULL CHECK (project_source_revision ~ '\S'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (project_id, connection_id)
);

CREATE FUNCTION project.list_connection_bindings(
  p_account_id uuid,
  p_project_id uuid
) RETURNS TABLE(
  connection_id uuid,
  connection_revision_id uuid,
  environment text,
  connection_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored_project project.project%ROWTYPE;
  selection record;
BEGIN
  IF p_account_id IS NULL OR p_project_id IS NULL THEN
    RAISE EXCEPTION 'PROJECT_BINDING_INPUT_REFUSED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO selection
  FROM iam.admit_connection_selection(p_account_id, p_project_id, 'PROJECT', p_project_id);
  IF NOT FOUND OR selection.scope_exists IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.admit_project_manage(p_account_id, p_project_id)) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_MANAGE_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO stored_project
  FROM project.project AS candidate
  WHERE candidate.project_id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT binding.connection_id, binding.connection_revision_id, binding.environment,
    con.get_project_binding_name(p_project_id, stored_project.workspace_id, binding.connection_id)
  FROM project.connection_binding AS binding
  WHERE binding.project_id = p_project_id
  ORDER BY binding.connection_id;
END;
$$;

CREATE FUNCTION project.prepare_connection_binding(
  p_account_id uuid,
  p_project_id uuid,
  p_connection_id uuid,
  p_connection_revision_id uuid,
  p_environment text,
  p_expected_current jsonb,
  p_remove boolean
) RETURNS TABLE(source_revision text, declaration jsonb, result jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored_project project.project%ROWTYPE;
  existing_binding project.connection_binding%ROWTYPE;
  selection record;
  admitted_qualification_id uuid;
  admitted_connection_name text;
  prepared_declaration jsonb;
  prepared_result jsonb;
  expected_state text;
  expected_revision text;
  expected_environment text;
  binding_found boolean;
BEGIN
  IF p_account_id IS NULL OR p_project_id IS NULL OR p_connection_id IS NULL
    OR p_connection_revision_id IS NULL OR p_environment IS NULL
    OR p_environment NOT IN ('SANDBOX', 'PRODUCTION')
    OR p_expected_current IS NULL OR p_remove IS NULL THEN
    RAISE EXCEPTION 'PROJECT_BINDING_INPUT_REFUSED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO selection
  FROM iam.admit_connection_selection(p_account_id, p_project_id, 'PROJECT', p_project_id);
  IF NOT FOUND OR selection.scope_exists IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.admit_project_manage(p_account_id, p_project_id)) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_MANAGE_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO stored_project
  FROM project.project AS candidate
  WHERE candidate.project_id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF jsonb_typeof(p_expected_current) IS DISTINCT FROM 'object'
    OR NOT (p_expected_current ? 'state') THEN
    RAISE EXCEPTION 'PROJECT_BINDING_EXPECTED_CURRENT_REFUSED' USING ERRCODE = '22023';
  END IF;
  expected_state := p_expected_current->>'state';
  IF expected_state = 'ABSENT' THEN
    NULL;
  ELSIF expected_state = 'PRESENT'
    AND (SELECT count(*) FROM jsonb_object_keys(p_expected_current)) = 3
    AND jsonb_typeof(p_expected_current->'connectionRevisionId') = 'string'
    AND COALESCE(p_expected_current->>'connectionRevisionId', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND jsonb_typeof(p_expected_current->'environment') = 'string'
    AND p_expected_current->>'environment' IN ('SANDBOX', 'PRODUCTION') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'PROJECT_BINDING_EXPECTED_CURRENT_REFUSED' USING ERRCODE = '22023';
  END IF;
  IF expected_state = 'ABSENT'
    AND (SELECT count(*) FROM jsonb_object_keys(p_expected_current)) <> 1 THEN
    RAISE EXCEPTION 'PROJECT_BINDING_EXPECTED_CURRENT_REFUSED' USING ERRCODE = '22023';
  END IF;
  IF p_remove AND expected_state <> 'PRESENT' THEN
    RAISE EXCEPTION 'PROJECT_BINDING_EXPECTED_CURRENT_REFUSED' USING ERRCODE = '22023';
  END IF;
  expected_revision := p_expected_current->>'connectionRevisionId';
  expected_environment := p_expected_current->>'environment';
  IF p_remove AND (p_connection_revision_id::text IS DISTINCT FROM expected_revision
    OR p_environment IS DISTINCT FROM expected_environment) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_CURRENT_MISMATCH' USING ERRCODE = 'P0412';
  END IF;

  SELECT * INTO existing_binding
  FROM project.connection_binding AS binding
  WHERE binding.project_id = p_project_id AND binding.connection_id = p_connection_id
  FOR SHARE;
  binding_found := FOUND;
  IF expected_state = 'ABSENT' AND binding_found THEN
    RAISE EXCEPTION 'PROJECT_BINDING_CURRENT_MISMATCH' USING ERRCODE = 'P0412';
  END IF;
  IF expected_state = 'PRESENT' AND (NOT binding_found
    OR existing_binding.connection_revision_id::text IS DISTINCT FROM expected_revision
    OR existing_binding.environment IS DISTINCT FROM expected_environment) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_CURRENT_MISMATCH' USING ERRCODE = 'P0412';
  END IF;

  IF NOT p_remove THEN
    IF selection.permitted IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'PROJECT_BINDING_USE_DENIED' USING ERRCODE = '42501';
    END IF;
    SELECT qualification_id, connection_name
      INTO STRICT admitted_qualification_id, admitted_connection_name
    FROM con.admit_project_binding_revision(
      p_project_id, stored_project.workspace_id, p_connection_id,
      p_connection_revision_id, p_environment
    );
  END IF;

  SELECT jsonb_build_object(
    'bindings', COALESCE(jsonb_agg(entry ORDER BY connection_id), '[]'::jsonb)
  ) INTO prepared_declaration
  FROM (
    SELECT binding.connection_id,
      jsonb_build_object(
        'connectionId', binding.connection_id,
        'connectionRevisionId', binding.connection_revision_id,
        'environment', binding.environment,
        'qualificationId', binding.qualification_id
      ) AS entry
    FROM project.connection_binding AS binding
    WHERE binding.project_id = p_project_id AND binding.connection_id <> p_connection_id
    UNION ALL
    SELECT p_connection_id,
      jsonb_build_object(
        'connectionId', p_connection_id,
        'connectionRevisionId', p_connection_revision_id,
        'environment', p_environment,
        'qualificationId', admitted_qualification_id
      )
    WHERE NOT p_remove
  ) AS entries;

  IF p_remove THEN
    prepared_result := NULL;
  ELSE
    prepared_result := jsonb_build_object(
      'connectionId', p_connection_id,
      'connectionRevisionId', p_connection_revision_id,
      'environment', p_environment,
      'connectionName', admitted_connection_name
    );
  END IF;
  RETURN QUERY SELECT stored_project.source_revision, prepared_declaration, prepared_result;
END;
$$;

CREATE FUNCTION project.settle_connection_binding(
  p_account_id uuid,
  p_project_id uuid,
  p_connection_id uuid,
  p_connection_revision_id uuid,
  p_environment text,
  p_expected_current jsonb,
  p_remove boolean,
  p_old_source_revision text,
  p_new_source_revision text,
  p_declaration jsonb,
  p_declaration_digest text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored_project project.project%ROWTYPE;
  selection record;
  prepared record;
  binding_entry jsonb;
  previous_connection_id text := '';
  entry_connection_id text;
BEGIN
  IF p_account_id IS NULL OR p_project_id IS NULL OR p_connection_id IS NULL
    OR p_connection_revision_id IS NULL OR p_environment IS NULL
    OR p_expected_current IS NULL OR p_remove IS NULL OR p_declaration IS NULL
    OR p_old_source_revision IS NULL OR p_new_source_revision IS NULL
    OR p_declaration_digest IS NULL
    OR p_environment NOT IN ('SANDBOX', 'PRODUCTION')
    OR p_old_source_revision !~ '^[0-9a-f]{40}$'
    OR p_new_source_revision !~ '^[0-9a-f]{40}$'
    OR p_old_source_revision = p_new_source_revision
    OR p_declaration_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'PROJECT_BINDING_SETTLEMENT_INPUT_REFUSED' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_declaration) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_declaration)) <> 1
    OR p_declaration ? 'bindings' = false
    OR jsonb_typeof(p_declaration->'bindings') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'PROJECT_BINDING_DECLARATION_REFUSED' USING ERRCODE = '22023';
  END IF;
  FOR binding_entry IN SELECT value FROM jsonb_array_elements(p_declaration->'bindings') LOOP
    IF jsonb_typeof(binding_entry) IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(binding_entry)) <> 4
      OR NOT (binding_entry ?& ARRAY['connectionId', 'connectionRevisionId', 'environment', 'qualificationId'])
      OR jsonb_typeof(binding_entry->'connectionId') IS DISTINCT FROM 'string'
      OR COALESCE(binding_entry->>'connectionId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(binding_entry->'connectionRevisionId') IS DISTINCT FROM 'string'
      OR COALESCE(binding_entry->>'connectionRevisionId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(binding_entry->'qualificationId') IS DISTINCT FROM 'string'
      OR COALESCE(binding_entry->>'qualificationId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(binding_entry->'environment') IS DISTINCT FROM 'string'
      OR binding_entry->>'environment' NOT IN ('SANDBOX', 'PRODUCTION') THEN
      RAISE EXCEPTION 'PROJECT_BINDING_DECLARATION_REFUSED' USING ERRCODE = '22023';
    END IF;
    entry_connection_id := binding_entry->>'connectionId';
    IF entry_connection_id <= previous_connection_id THEN
      RAISE EXCEPTION 'PROJECT_BINDING_DECLARATION_REFUSED' USING ERRCODE = '22023';
    END IF;
    previous_connection_id := entry_connection_id;
  END LOOP;

  SELECT * INTO selection
  FROM iam.admit_connection_selection(p_account_id, p_project_id, 'PROJECT', p_project_id);
  IF NOT FOUND OR selection.scope_exists IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.admit_project_manage(p_account_id, p_project_id)) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_MANAGE_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO stored_project
  FROM project.project AS candidate
  WHERE candidate.project_id = p_project_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF stored_project.source_revision <> p_old_source_revision THEN
    RAISE EXCEPTION 'PROJECT_BINDING_SOURCE_STALE' USING ERRCODE = 'P0412';
  END IF;

  SELECT * INTO STRICT prepared
  FROM project.prepare_connection_binding(
    p_account_id, p_project_id, p_connection_id, p_connection_revision_id,
    p_environment, p_expected_current, p_remove
  );
  IF prepared.source_revision <> p_old_source_revision THEN
    RAISE EXCEPTION 'PROJECT_BINDING_SOURCE_STALE' USING ERRCODE = 'P0412';
  END IF;
  IF prepared.declaration IS DISTINCT FROM p_declaration THEN
    RAISE EXCEPTION 'PROJECT_BINDING_DECLARATION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  IF p_remove THEN
    DELETE FROM project.connection_binding AS binding
    WHERE binding.project_id = p_project_id AND binding.connection_id = p_connection_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROJECT_BINDING_CURRENT_MISMATCH' USING ERRCODE = 'P0412';
    END IF;
  ELSE
    INSERT INTO project.connection_binding (
      project_id, connection_id, connection_revision_id, qualification_id,
      environment, binding_digest, project_source_revision
    ) VALUES (
      p_project_id, p_connection_id, p_connection_revision_id,
      (
        SELECT (binding_value->>'qualificationId')::uuid
        FROM jsonb_array_elements(prepared.declaration->'bindings') AS values(binding_value)
        WHERE binding_value->>'connectionId' = p_connection_id::text
      ),
      p_environment, p_declaration_digest, p_new_source_revision
    )
    ON CONFLICT (project_id, connection_id) DO UPDATE SET
      connection_revision_id = EXCLUDED.connection_revision_id,
      qualification_id = EXCLUDED.qualification_id,
      environment = EXCLUDED.environment,
      binding_digest = EXCLUDED.binding_digest,
      project_source_revision = EXCLUDED.project_source_revision,
      updated_at = clock_timestamp();
  END IF;

  UPDATE project.project AS candidate
  SET source_revision = p_new_source_revision
  WHERE candidate.project_id = p_project_id
    AND candidate.source_revision = p_old_source_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_BINDING_SOURCE_STALE' USING ERRCODE = 'P0412';
  END IF;
  RETURN prepared.result;
END;
$$;

REVOKE ALL ON project.brain_binding, project.connection_binding FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.list_connection_bindings(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.prepare_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.settle_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean, text, text, jsonb, text) FROM PUBLIC;
RESET ROLE;

GRANT USAGE ON SCHEMA iam, reg, brn TO hub_r2_brain_read;
GRANT EXECUTE ON FUNCTION iam.admit_brain_read(uuid, uuid) TO hub_r2_brain_read;
GRANT EXECUTE ON FUNCTION reg.get_workspace_brain(uuid, uuid[]) TO hub_r2_brain_read;
GRANT EXECUTE ON FUNCTION reg.list_brain_revisions(uuid, uuid[]) TO hub_r2_brain_read;
GRANT EXECUTE ON FUNCTION reg.get_brain_revision(uuid, uuid, uuid[]) TO hub_r2_brain_read;
GRANT EXECUTE ON FUNCTION brn.get_brain_health(uuid, text) TO hub_r2_brain_read;

GRANT USAGE ON SCHEMA reg, brn TO hub_r2_brain_bootstrap;
GRANT EXECUTE ON FUNCTION reg.bootstrap_workspace_brain(uuid, uuid, uuid, text, text, jsonb)
  TO hub_r2_brain_bootstrap;
GRANT EXECUTE ON FUNCTION brn.bootstrap_brain_health(text, uuid, text, jsonb)
  TO hub_r2_brain_bootstrap;

GRANT USAGE ON SCHEMA iam TO connections_owner;
GRANT EXECUTE ON FUNCTION iam.admit_connection_read(uuid, text, uuid) TO connections_owner;
GRANT EXECUTE ON FUNCTION iam.admit_connection_manage(uuid, text, uuid) TO connections_owner;
GRANT EXECUTE ON FUNCTION iam.admit_connection_qualify(uuid, text, uuid) TO connections_owner;
GRANT EXECUTE ON FUNCTION iam.admit_connection_selection(uuid, uuid, text, uuid) TO connections_owner;
GRANT USAGE ON SCHEMA con TO project_owner;
GRANT EXECUTE ON FUNCTION con.get_project_binding_name(uuid, uuid, uuid) TO project_owner;
GRANT EXECUTE ON FUNCTION con.admit_project_binding_revision(uuid, uuid, uuid, uuid, text) TO project_owner;
GRANT EXECUTE ON FUNCTION iam.admit_connection_selection(uuid, uuid, text, uuid) TO project_owner;

GRANT USAGE ON SCHEMA project TO hub_r2_project_binding;
GRANT EXECUTE ON FUNCTION project.list_connection_bindings(uuid, uuid) TO hub_r2_project_binding;
GRANT EXECUTE ON FUNCTION project.prepare_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean)
  TO hub_r2_project_binding;
GRANT EXECUTE ON FUNCTION project.settle_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean, text, text, jsonb, text)
  TO hub_r2_project_binding;

GRANT USAGE ON SCHEMA iam, con TO hub_r2_connections;
GRANT EXECUTE ON FUNCTION iam.admit_any_connection_read(uuid) TO hub_r2_connections;
GRANT EXECUTE ON FUNCTION con.list_connections(uuid, text, uuid, uuid) TO hub_r2_connections;
GRANT EXECUTE ON FUNCTION con.get_connection(uuid, uuid) TO hub_r2_connections;
GRANT EXECUTE ON FUNCTION con.create_or_replay_connection(uuid, text, uuid, text, text, uuid, uuid, text, text, text, jsonb, text)
  TO hub_r2_connections;
GRANT EXECUTE ON FUNCTION con.revise_connection(uuid, uuid, uuid, uuid, jsonb, text) TO hub_r2_connections;
GRANT EXECUTE ON FUNCTION con.reserve_connection_credential(uuid, uuid, text, text) TO hub_r2_connections;
GRANT EXECUTE ON FUNCTION con.settle_connection_credential(uuid, uuid, text, text, bigint) TO hub_r2_connections;
GRANT EXECUTE ON FUNCTION con.reserve_connection_qualification(uuid, uuid, uuid, text, text, text, uuid, uuid)
  TO hub_r2_connections;
GRANT EXECUTE ON FUNCTION con.settle_connection_qualification(uuid, uuid, uuid, uuid, bigint, text, uuid, text, text, jsonb, text[], timestamptz)
  TO hub_r2_connections;
GRANT EXECUTE ON FUNCTION con.get_connection_qualification(uuid, uuid, uuid) TO hub_r2_connections;

REVOKE ALL ON ALL TABLES IN SCHEMA iam, reg, brn, con
  FROM hub_r2_brain_read, hub_r2_brain_bootstrap, hub_r2_connections;
REVOKE ALL ON ALL TABLES IN SCHEMA iam, con, project FROM hub_r2_project_binding;
REVOKE ALL ON project.brain_binding, project.connection_binding
  FROM hub_r2_brain_read, hub_r2_brain_bootstrap, hub_r2_connections, hub_r2_project_binding;

DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hub_r2_brain_read, hub_r2_brain_bootstrap, hub_r2_connections, hub_r2_project_binding', current_database());
END $$;

COMMIT;
