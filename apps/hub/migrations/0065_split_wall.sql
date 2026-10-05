BEGIN;

DROP POLICY workspace_select ON workspace.workspace;
DROP POLICY workspace_insert ON workspace.workspace;
DROP POLICY workspace_delete ON workspace.workspace;
DROP POLICY receipt_select ON platform.operation_receipt;
DROP POLICY receipt_insert ON platform.operation_receipt;
DROP POLICY receipt_update ON platform.operation_receipt;
DROP POLICY receipt_delete ON platform.operation_receipt;
DROP POLICY project_select ON project.project;
DROP POLICY project_insert ON project.project;
DROP POLICY project_update ON project.project;
DROP POLICY project_delete ON project.project;
DROP POLICY project_deletion_select ON project.project_deletion;
DROP POLICY project_deletion_insert ON project.project_deletion;
DROP POLICY project_deletion_update ON project.project_deletion;
DROP POLICY project_deletion_delete ON project.project_deletion;
DROP POLICY builder_run_select ON builder.builder_run;
DROP POLICY working_state_select ON builder.project_working_state;

DROP FUNCTION iam.acting_account();
DROP FUNCTION iam.acting_scope();
DROP FUNCTION iam.acting_workspaces();
DROP FUNCTION iam.acting_installation_administrator();
DROP FUNCTION iam.acting_applications();
REVOKE SELECT ON iam.application_grant FROM iam_rls;

ALTER TABLE workspace.workspace DROP COLUMN created_by;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hub_reader') THEN
    CREATE ROLE hub_reader NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hub_command') THEN
    CREATE ROLE hub_command NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
GRANT hub_reader, hub_command TO hub_runtime WITH INHERIT FALSE, SET TRUE;
-- Every lock wait, statement and idle transaction of the Hub is bounded. The values sit above the longest
-- transaction the Hub suites and the live flows observe and below the pool's patience; the role register
-- carries them and the catalog check refuses a login role that differs.
ALTER ROLE hub_runtime SET lock_timeout = '5s';
ALTER ROLE hub_runtime SET statement_timeout = '30s';
ALTER ROLE hub_runtime SET idle_in_transaction_session_timeout = '60s';
GRANT USAGE ON SCHEMA iam, workspace, project, builder, reg, model, connector, platform TO hub_reader, hub_command;

CREATE SCHEMA rls AUTHORIZATION conexus_owner;
REVOKE ALL ON SCHEMA rls FROM PUBLIC;
GRANT USAGE ON SCHEMA rls TO hub_reader, iam_rls;

CREATE FUNCTION rls.acting_account() RETURNS uuid LANGUAGE sql STABLE
SET search_path TO pg_catalog, pg_temp AS $$
  SELECT nullif(current_setting('conexus.account_id', true), '')::uuid;
$$;
CREATE FUNCTION rls.acting_workspaces() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, pg_temp AS $$
  SELECT membership.workspace_id
  FROM iam.workspace_membership AS membership
  JOIN iam.account AS account ON account.account_id = membership.account_id
  WHERE membership.account_id = rls.acting_account() AND account.active;
$$;
CREATE FUNCTION rls.acting_installation_administrator() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM iam.installation_administrator AS tenure
    JOIN iam.account AS account ON account.account_id = tenure.account_id AND account.active
    WHERE tenure.account_id = rls.acting_account() AND tenure.revoked_at IS NULL
  );
$$;
ALTER FUNCTION rls.acting_account() OWNER TO iam_rls;
ALTER FUNCTION rls.acting_workspaces() OWNER TO iam_rls;
ALTER FUNCTION rls.acting_installation_administrator() OWNER TO iam_rls;
REVOKE ALL ON FUNCTION rls.acting_account(), rls.acting_workspaces(), rls.acting_installation_administrator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rls.acting_account(), rls.acting_workspaces(), rls.acting_installation_administrator() TO hub_reader;

CREATE FUNCTION iam.lock_administrators() RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path TO pg_catalog, pg_temp AS $$
  LOCK TABLE iam.installation_administrator IN SHARE ROW EXCLUSIVE MODE;
$$;
ALTER FUNCTION iam.lock_administrators() OWNER TO iam_owner;
REVOKE ALL ON FUNCTION iam.lock_administrators() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam.lock_administrators() TO hub_command;

CREATE OR REPLACE FUNCTION iam.purge_project(p_project_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF current_setting('conexus.job', true) IS DISTINCT FROM 'project-purge' THEN
    RAISE EXCEPTION 'PURGE_REQUIRES_SYSTEM' USING ERRCODE = '42501';
  END IF;
  DELETE FROM iam.handoff
  WHERE project_id = p_project_id
     OR preview_id IN (SELECT preview_id FROM iam.preview WHERE project_id = p_project_id);
  DELETE FROM iam.host_session
  WHERE project_id = p_project_id
     OR preview_id IN (SELECT preview_id FROM iam.preview WHERE project_id = p_project_id);
  DELETE FROM iam.preview WHERE project_id = p_project_id;
  DELETE FROM iam.application_grant WHERE project_id = p_project_id;
  DELETE FROM iam.application_invitation WHERE project_id = p_project_id;
  DELETE FROM iam.oidc_transaction WHERE application_project_id = p_project_id;
  DELETE FROM iam.application WHERE project_id = p_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION connector.purge_project(p_project_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF current_setting('conexus.job', true) IS DISTINCT FROM 'project-purge' THEN
    RAISE EXCEPTION 'PURGE_REQUIRES_SYSTEM' USING ERRCODE = '42501';
  END IF;
  DELETE FROM connector.project_binding WHERE project_id = p_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION reg.purge_project(p_project_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF current_setting('conexus.job', true) IS DISTINCT FROM 'project-purge' THEN
    RAISE EXCEPTION 'PURGE_REQUIRES_SYSTEM' USING ERRCODE = '42501';
  END IF;
  DELETE FROM reg.artifact_revision
  WHERE artifact_id IN (SELECT artifact_id FROM reg.artifact WHERE project_id = p_project_id);
  DELETE FROM reg.artifact WHERE project_id = p_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION builder.purge_project(p_project_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF current_setting('conexus.job', true) IS DISTINCT FROM 'project-purge' THEN
    RAISE EXCEPTION 'PURGE_REQUIRES_SYSTEM' USING ERRCODE = '42501';
  END IF;
  DELETE FROM builder.builder_run WHERE project_id = p_project_id;
  DELETE FROM builder.project_working_state WHERE project_id = p_project_id;
  DELETE FROM builder.project_repository WHERE project_id = p_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION reg.get_served_application(p_account_id uuid, p_project_id uuid)
 RETURNS TABLE(artifact_revision_id uuid, artifact_digest text, source_revision text, entry_path text, files jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  served record;
  revision_row reg.artifact_revision%ROWTYPE;
BEGIN
  IF p_account_id IS DISTINCT FROM nullif(current_setting('conexus.account_id', true), '')::uuid THEN RETURN; END IF;
  IF NOT iam.has_application_access(p_account_id, p_project_id) THEN RETURN; END IF;
  SELECT pointer.* INTO served FROM builder.served_preview_revision(p_project_id) AS pointer;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT revision.* INTO revision_row
  FROM reg.artifact AS artifact
  JOIN reg.artifact_revision AS revision ON revision.artifact_id = artifact.artifact_id
  WHERE artifact.project_id = p_project_id AND artifact.kind = 'application'
    AND revision.artifact_revision_id = served.artifact_revision_id
    AND revision.source_revision = served.source_revision
    AND revision.digest = served.artifact_digest
    AND revision.availability = 'AVAILABLE';
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT revision_row.artifact_revision_id, revision_row.digest, revision_row.source_revision,
    revision_row.payload->>'entryPath',
    (SELECT jsonb_agg(jsonb_build_object('path', value->>'path', 'mediaType', value->>'mediaType')
      ORDER BY value->>'path' COLLATE "C") FROM jsonb_array_elements(revision_row.payload->'files') AS files_list(value));
END;
$$;

CREATE OR REPLACE FUNCTION reg.read_served_application_file(p_account_id uuid, p_project_id uuid, p_artifact_revision_id uuid, p_path text)
 RETURNS TABLE(artifact_revision_id uuid, path text, media_type text, bytes bytea, sha256 text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $$
  SELECT revision.artifact_revision_id, file->>'path', file->>'mediaType', decode(file->>'base64', 'base64'), file->>'sha256'
  FROM builder.served_preview_revision(p_project_id) AS served
  JOIN reg.artifact_revision AS revision ON revision.artifact_revision_id = served.artifact_revision_id
  JOIN reg.artifact AS artifact ON artifact.artifact_id = revision.artifact_id
  LEFT JOIN LATERAL jsonb_path_query_first(revision.payload, '$.files[*] ? (@.path == $path)', jsonb_build_object('path', p_path)) AS file ON true
  WHERE p_account_id = nullif(current_setting('conexus.account_id', true), '')::uuid
    AND iam.has_application_access(p_account_id, p_project_id)
    AND artifact.project_id = p_project_id AND artifact.kind = 'application'
    AND revision.source_revision = served.source_revision AND revision.digest = served.artifact_digest
    AND revision.availability = 'AVAILABLE'
    AND (p_artifact_revision_id IS NULL OR revision.artifact_revision_id = p_artifact_revision_id);
$$;

CREATE OR REPLACE FUNCTION reg.get_application_thumbnail(p_account_id uuid, p_project_id uuid)
 RETURNS TABLE(artifact_revision_id uuid, media_type text, bytes bytea, byte_length integer, sha256 text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  served record;
  thumbnail_row reg.application_thumbnail%ROWTYPE;
BEGIN
  IF p_account_id IS NULL OR p_project_id IS NULL THEN RETURN; END IF;
  IF p_account_id IS DISTINCT FROM nullif(current_setting('conexus.account_id', true), '')::uuid THEN RETURN; END IF;
  IF NOT iam.has_application_access(p_account_id, p_project_id) THEN RETURN; END IF;
  SELECT pointer.* INTO served FROM builder.served_preview_revision(p_project_id) AS pointer;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT stored.* INTO thumbnail_row
  FROM reg.application_thumbnail AS stored
  WHERE stored.project_id = p_project_id
    AND stored.artifact_revision_id = served.artifact_revision_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY SELECT thumbnail_row.artifact_revision_id, thumbnail_row.media_type,
    thumbnail_row.bytes, thumbnail_row.byte_length, thumbnail_row.sha256;
END;
$$;

ALTER TABLE iam.account ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.account FORCE ROW LEVEL SECURITY;
ALTER TABLE iam.workspace_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.workspace_membership FORCE ROW LEVEL SECURITY;

CREATE POLICY reader ON workspace.workspace FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND workspace_id IN (SELECT rls.acting_workspaces()));
CREATE POLICY reader ON project.project FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL
    AND workspace_id IN (SELECT rls.acting_workspaces())
    AND project_id NOT IN (
      SELECT hidden.project_id FROM project.project_deletion AS hidden
      WHERE hidden.completed_at IS NOT NULL OR NOT (SELECT rls.acting_installation_administrator())));
CREATE POLICY reader ON project.project_deletion FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND workspace_id IN (SELECT rls.acting_workspaces()));
CREATE POLICY reader_admin ON project.project_deletion FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND (SELECT rls.acting_installation_administrator()));
CREATE POLICY reader ON builder.builder_run FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND project_id IN (SELECT visible.project_id FROM project.project AS visible));
CREATE POLICY reader ON builder.project_working_state FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND project_id IN (SELECT visible.project_id FROM project.project AS visible));
CREATE POLICY reader ON iam.workspace_membership FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND workspace_id IN (SELECT rls.acting_workspaces()));
CREATE POLICY reader ON iam.account FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL
    AND (account_id = (SELECT rls.acting_account()) OR account_id IN (SELECT member.account_id FROM iam.workspace_membership AS member)));

CREATE POLICY command ON workspace.workspace TO hub_command USING (true) WITH CHECK (true);
CREATE POLICY command ON platform.operation_receipt TO hub_command USING (true) WITH CHECK (true);
CREATE POLICY command ON project.project TO hub_command USING (true) WITH CHECK (true);
CREATE POLICY command ON project.project_deletion TO hub_command USING (true) WITH CHECK (true);
CREATE POLICY command ON builder.builder_run TO hub_command USING (true) WITH CHECK (true);
CREATE POLICY command ON builder.project_working_state TO hub_command USING (true) WITH CHECK (true);
CREATE POLICY command ON iam.account TO hub_command USING (true) WITH CHECK (true);
CREATE POLICY command ON iam.workspace_membership TO hub_command USING (true) WITH CHECK (true);

CREATE POLICY iam_rls ON iam.account FOR SELECT TO iam_rls USING (true);
CREATE POLICY iam_rls ON iam.workspace_membership FOR SELECT TO iam_rls USING (true);
CREATE POLICY legacy_owner ON iam.account TO iam_owner USING (true) WITH CHECK (true);
CREATE POLICY legacy_owner ON iam.workspace_membership TO iam_owner USING (true) WITH CHECK (true);
CREATE POLICY legacy_runtime ON iam.account TO hub_runtime USING (true) WITH CHECK (true);

REVOKE ALL ON workspace.workspace, platform.operation_receipt, project.project, project.project_deletion,
  builder.builder_run, builder.project_working_state, iam.workspace_membership FROM hub_runtime;

GRANT SELECT ON workspace.workspace, project.project, project.project_deletion, builder.builder_run,
  builder.project_working_state, iam.workspace_membership TO hub_reader;
GRANT SELECT (account_id, display_name, email) ON iam.account TO hub_reader;
REVOKE ALL ON iam.account FROM hub_iam_runtime;

GRANT SELECT, INSERT ON workspace.workspace TO hub_command;
GRANT SELECT, INSERT, DELETE, UPDATE (state, response_status, response_body, completed_at) ON platform.operation_receipt TO hub_command;
GRANT SELECT, INSERT, DELETE, UPDATE (name) ON project.project TO hub_command;
GRANT SELECT, INSERT, DELETE, UPDATE (purged_at, completed_at) ON project.project_deletion TO hub_command;
GRANT SELECT ON builder.builder_run, builder.project_working_state TO hub_command;
GRANT SELECT, UPDATE (created_at) ON iam.account TO hub_command;
GRANT SELECT, INSERT, UPDATE (created_at) ON iam.workspace_membership TO hub_command;
GRANT SELECT, UPDATE (revoked_at) ON iam.installation_administrator TO hub_command;
GRANT SELECT ON iam.application TO hub_command;
GRANT SELECT, UPDATE (revoked_at) ON iam.application_grant TO hub_command;

GRANT EXECUTE ON FUNCTION builder.register_project_repository(uuid), builder.purge_project(uuid),
  connector.purge_project(uuid), reg.purge_project(uuid), iam.purge_project(uuid) TO hub_command;
REVOKE EXECUTE ON FUNCTION builder.register_project_repository(uuid), builder.purge_project(uuid),
  connector.purge_project(uuid), reg.purge_project(uuid), iam.purge_project(uuid) FROM hub_runtime;
GRANT EXECUTE ON FUNCTION reg.get_served_application(uuid, uuid),
  reg.read_served_application_file(uuid, uuid, uuid, text), reg.get_application_thumbnail(uuid, uuid) TO hub_reader;

COMMIT;
