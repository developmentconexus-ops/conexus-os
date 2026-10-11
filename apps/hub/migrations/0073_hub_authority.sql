BEGIN;

-- A role belongs to the cluster and its grants to one database, so this database cannot clear what
-- another one still holds, and the roles cannot be dropped while it does. Stop before anything here
-- changes: that other database is moved or rebuilt first.
DO $migration$
DECLARE
  elsewhere text;
BEGIN
  SELECT string_agg(DISTINCT format('%s in %s', role.rolname, database.datname), ', ' ORDER BY format('%s in %s', role.rolname, database.datname))
  INTO elsewhere
  FROM pg_shdepend AS dependency
  JOIN pg_roles AS role ON role.oid = dependency.refobjid
  JOIN pg_database AS database ON database.oid = dependency.dbid
  WHERE dependency.refclassid = 'pg_authid'::regclass
    AND role.rolname IN ('hub_reader', 'hub_command', 'iam_rls', 'hub_builder_ingress')
    AND database.datname <> current_database();
  IF elsewhere IS NOT NULL THEN
    RAISE EXCEPTION 'HUB_AUTHORITY_ROLE_USED_BY_ANOTHER_DATABASE: %', elsewhere;
  END IF;
END
$migration$;

DO $migration$
DECLARE
  policy_row record;
  relation_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname IN ('builder', 'connector', 'iam', 'model', 'platform', 'project', 'reg', 'workspace')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  END LOOP;

  FOR relation_row IN
    SELECT namespace.nspname AS schema_name, relation.relname AS table_name
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE relation.relkind IN ('r', 'p') AND relation.relrowsecurity
      AND namespace.nspname IN ('builder', 'connector', 'iam', 'model', 'platform', 'project', 'reg', 'workspace')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I NO FORCE ROW LEVEL SECURITY', relation_row.schema_name, relation_row.table_name);
    EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', relation_row.schema_name, relation_row.table_name);
  END LOOP;
END
$migration$;

UPDATE builder.builder_run
SET failure_code = 'INTERNAL_UNEXPECTED'
WHERE failure_code IN ('PROJECT_SUMMARIES_UNAVAILABLE', 'PROJECT_THUMBNAIL_UNAVAILABLE', 'CONNECTOR_WORKSPACE_NOT_FOUND');

REVOKE hub_reader, hub_command FROM hub_runtime;
REVOKE hub_reader FROM hub_command;
GRANT EXECUTE ON FUNCTION iam.lock_administrators() TO hub_runtime;
REVOKE EXECUTE ON FUNCTION iam.lock_administrators() FROM hub_command;

GRANT DELETE, INSERT, SELECT, UPDATE (cancellation_reason, cancellation_requested_at, candidate_revision, failure_code, finished_at, heartbeat_at, owner_id, phase, result_kind, result_source_revision, sandbox_id, started_at, state, trigger_message_id) ON builder.builder_run TO hub_runtime;
GRANT INSERT, SELECT ON builder.builder_run_model_account TO hub_runtime;
GRANT INSERT, SELECT, UPDATE (last_turn_ended_at, mirror_head, provider_sandbox_id, synced_main) ON builder.conversation_session TO hub_runtime;
GRANT DELETE, INSERT, SELECT ON builder.project_repository TO hub_runtime;
GRANT DELETE, INSERT, SELECT, UPDATE (current_state, last_preview_artifact_digest, last_preview_artifact_revision_id, last_preview_source_revision, updated_at) ON builder.project_working_state TO hub_runtime;
GRANT INSERT, SELECT, UPDATE (disabled_at, disabled_by) ON connector.connection TO hub_runtime;
GRANT DELETE, INSERT, SELECT, UPDATE (unbound_at, unbound_by) ON connector.project_binding TO hub_runtime;
GRANT INSERT, SELECT, UPDATE (email) ON iam.account TO hub_runtime;
GRANT DELETE, INSERT, SELECT ON iam.application TO hub_runtime;
GRANT DELETE, INSERT, SELECT, UPDATE (revoked_at, revoked_by) ON iam.application_grant TO hub_runtime;
GRANT DELETE, INSERT, SELECT, UPDATE (created_at, expires_at, invited_by) ON iam.application_invitation TO hub_runtime;
GRANT DELETE, INSERT, SELECT, UPDATE (expires_at) ON iam.handoff TO hub_runtime;
GRANT DELETE, INSERT, SELECT, UPDATE (idle_expires_at, provider_checked_at, provider_refresh_token) ON iam.host_session TO hub_runtime;
GRANT INSERT, SELECT, UPDATE (revoked_at, revoked_by) ON iam.installation_administrator TO hub_runtime;
GRANT DELETE, INSERT, SELECT, UPDATE (expires_at) ON iam.oidc_transaction TO hub_runtime;
GRANT DELETE, INSERT, SELECT, UPDATE (created_at, expires_at, invited_by, role) ON iam.workspace_invitation TO hub_runtime;
GRANT DELETE, INSERT, SELECT, UPDATE (role) ON iam.workspace_membership TO hub_runtime;
GRANT SELECT ON model.installation_default TO hub_runtime;
GRANT INSERT (kind, owner_account_id, provider, secret), SELECT, UPDATE (kind, secret, updated_at) ON model.model_account TO hub_runtime;
GRANT DELETE, INSERT, SELECT, UPDATE (completed_at, response_body, response_status, state) ON platform.operation_receipt TO hub_runtime;
GRANT DELETE, INSERT, SELECT, UPDATE (name) ON project.project TO hub_runtime;
GRANT DELETE, INSERT, SELECT, UPDATE (completed_at, purged_at) ON project.project_deletion TO hub_runtime;
GRANT INSERT, SELECT ON reg.application_thumbnail TO hub_runtime;
GRANT DELETE, INSERT, SELECT ON reg.artifact_revision TO hub_runtime;
GRANT INSERT, SELECT ON workspace.workspace TO hub_runtime;

DROP FUNCTION rls.acting_account();
DROP FUNCTION rls.acting_installation_administrator();
DROP FUNCTION rls.acting_workspaces();
DROP SCHEMA rls;

REVOKE ALL ON ALL TABLES IN SCHEMA builder, connector, iam, model, platform, project, reg, workspace FROM hub_reader, hub_command, iam_rls, hub_builder_ingress;
REVOKE ALL ON SCHEMA builder, connector, iam, model, platform, project, reg, workspace FROM hub_reader, hub_command, iam_rls, hub_builder_ingress;

-- The revokes above are every grant the migrations gave these roles. Anything they still own or
-- hold was put here by hand, and is not this migration's to remove.
DO $migration$
DECLARE
  unexpected text;
BEGIN
  SELECT string_agg(format('%s on %s', role.rolname, pg_describe_object(dependency.classid, dependency.objid, dependency.objsubid)), ', ' ORDER BY role.rolname, pg_describe_object(dependency.classid, dependency.objid, dependency.objsubid))
  INTO unexpected
  FROM pg_shdepend AS dependency
  JOIN pg_roles AS role ON role.oid = dependency.refobjid
  WHERE dependency.refclassid = 'pg_authid'::regclass
    AND role.rolname IN ('hub_reader', 'hub_command', 'iam_rls', 'hub_builder_ingress');
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'HUB_AUTHORITY_ROLE_DEPENDENCY_UNEXPECTED: %', unexpected;
  END IF;
END
$migration$;

DROP ROLE hub_reader;
DROP ROLE hub_command;
DROP ROLE iam_rls;
DROP ROLE hub_builder_ingress;

COMMIT;
