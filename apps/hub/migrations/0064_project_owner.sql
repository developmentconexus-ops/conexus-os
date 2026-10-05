BEGIN;

ALTER TABLE project.project_deletion ADD COLUMN purged_at timestamptz;
UPDATE project.project_deletion AS tombstone SET purged_at = tombstone.requested_at
WHERE NOT EXISTS (SELECT 1 FROM project.project AS stored WHERE stored.project_id = tombstone.project_id);

CREATE INDEX project_workspace_id_idx ON project.project (workspace_id);
CREATE INDEX project_deletion_workspace_id_idx ON project.project_deletion (workspace_id);

ALTER TABLE project.project ENABLE ROW LEVEL SECURITY;
ALTER TABLE project.project FORCE ROW LEVEL SECURITY;
ALTER TABLE project.project_deletion ENABLE ROW LEVEL SECURITY;
ALTER TABLE project.project_deletion FORCE ROW LEVEL SECURITY;
ALTER TABLE builder.builder_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.builder_run FORCE ROW LEVEL SECURITY;
ALTER TABLE builder.project_working_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.project_working_state FORCE ROW LEVEL SECURITY;

CREATE POLICY project_select ON project.project FOR SELECT TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system'
    OR ((SELECT iam.acting_account()) IS NOT NULL
      AND workspace_id IN (SELECT iam.acting_workspaces())
      AND project_id NOT IN (
        SELECT hidden.project_id FROM project.project_deletion AS hidden
        WHERE hidden.completed_at IS NOT NULL OR NOT (SELECT iam.acting_installation_administrator()))));
CREATE POLICY project_insert ON project.project FOR INSERT TO hub_runtime
  WITH CHECK ((SELECT iam.acting_account()) IS NOT NULL AND workspace_id IN (SELECT iam.acting_workspaces()));
CREATE POLICY project_update ON project.project FOR UPDATE TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system'
    OR ((SELECT iam.acting_account()) IS NOT NULL
      AND workspace_id IN (SELECT iam.acting_workspaces())
      AND project_id NOT IN (
        SELECT hidden.project_id FROM project.project_deletion AS hidden
        WHERE hidden.completed_at IS NOT NULL OR NOT (SELECT iam.acting_installation_administrator()))))
  WITH CHECK ((SELECT iam.acting_scope()) = 'system'
    OR ((SELECT iam.acting_account()) IS NOT NULL
      AND workspace_id IN (SELECT iam.acting_workspaces())
      AND project_id NOT IN (
        SELECT hidden.project_id FROM project.project_deletion AS hidden
        WHERE hidden.completed_at IS NOT NULL OR NOT (SELECT iam.acting_installation_administrator()))));
CREATE POLICY project_delete ON project.project FOR DELETE TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system');

CREATE POLICY project_deletion_select ON project.project_deletion FOR SELECT TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system'
    OR ((SELECT iam.acting_account()) IS NOT NULL
      AND (workspace_id IN (SELECT iam.acting_workspaces()) OR (SELECT iam.acting_installation_administrator()))));
CREATE POLICY project_deletion_insert ON project.project_deletion FOR INSERT TO hub_runtime
  WITH CHECK ((SELECT iam.acting_scope()) = 'system');
CREATE POLICY project_deletion_update ON project.project_deletion FOR UPDATE TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system') WITH CHECK ((SELECT iam.acting_scope()) = 'system');
CREATE POLICY project_deletion_delete ON project.project_deletion FOR DELETE TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system');

CREATE POLICY builder_run_select ON builder.builder_run FOR SELECT TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system' OR project_id IN (SELECT visible.project_id FROM project.project AS visible));
CREATE POLICY working_state_select ON builder.project_working_state FOR SELECT TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system' OR project_id IN (SELECT visible.project_id FROM project.project AS visible));

CREATE POLICY legacy_owner ON project.project TO iam_owner, connector_owner USING (true) WITH CHECK (true);
CREATE POLICY legacy_owner ON project.project_deletion TO iam_owner, connector_owner USING (true) WITH CHECK (true);
CREATE POLICY legacy_owner ON builder.builder_run TO builder_owner USING (true) WITH CHECK (true);
CREATE POLICY legacy_owner ON builder.project_working_state TO builder_owner USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON project.project, project.project_deletion TO hub_runtime;
GRANT SELECT ON builder.builder_run, builder.project_working_state TO hub_runtime;
GRANT EXECUTE ON FUNCTION builder.register_project_repository(uuid), builder.purge_project(uuid),
  connector.purge_project(uuid), reg.purge_project(uuid), iam.purge_project(uuid) TO hub_runtime;

DROP FUNCTION project.list_project_summaries(uuid, uuid);
DROP FUNCTION project.get_project(uuid, uuid);
DROP FUNCTION project.list_project_summaries_with_activity(uuid, uuid);
DROP FUNCTION project.reserve_or_replay_create_project(uuid, uuid, text, text, uuid);
DROP FUNCTION project.lock_create_project_receipt(uuid, uuid, text, text, uuid);
DROP FUNCTION project.complete_create_project_receipt(uuid, uuid, text, text, uuid, integer, text, jsonb);
DROP FUNCTION project.create_project_with_repository(uuid, uuid, text, text, uuid, text, text, text);
DROP FUNCTION project.begin_project_deletion(uuid, uuid, text);
DROP FUNCTION project.purge_project(uuid);
DROP FUNCTION project.complete_project_deletion(uuid);
DROP TABLE project.operation_idempotency;

REVOKE ALL ON builder.builder_run, builder.project_working_state FROM project_owner;

DROP OWNED BY hub_project_read, hub_project_command;
DROP ROLE hub_project_read, hub_project_command;

COMMIT;
