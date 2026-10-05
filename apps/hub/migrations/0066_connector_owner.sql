BEGIN;

ALTER TABLE connector.connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector.connection FORCE ROW LEVEL SECURITY;
ALTER TABLE connector.project_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector.project_binding FORCE ROW LEVEL SECURITY;

-- A Workspace owner sees the enabled Connections it may bind. The membership subquery runs under that table's reader policy.
CREATE POLICY reader ON connector.connection FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL
    AND disabled_at IS NULL
    AND workspace_id IN (
      SELECT membership.workspace_id FROM iam.workspace_membership AS membership
      WHERE membership.account_id = (SELECT rls.acting_account()) AND membership.role = 'owner'));
CREATE POLICY reader_admin ON connector.connection FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND (SELECT rls.acting_installation_administrator()));
CREATE POLICY reader ON connector.project_binding FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL
    AND unbound_at IS NULL
    AND workspace_id IN (
      SELECT membership.workspace_id FROM iam.workspace_membership AS membership
      WHERE membership.account_id = (SELECT rls.acting_account()) AND membership.role = 'owner')
    AND project_id IN (SELECT visible.project_id FROM project.project AS visible WHERE visible.archived = false));

CREATE POLICY command ON connector.connection TO hub_command USING (true) WITH CHECK (true);
CREATE POLICY command ON connector.project_binding TO hub_command USING (true) WITH CHECK (true);

REVOKE ALL ON connector.connection, connector.project_binding FROM hub_runtime;

GRANT SELECT (connection_id, workspace_id, connector_id, label, created_by, created_at, disabled_by, disabled_at)
  ON connector.connection TO hub_reader;
GRANT SELECT ON connector.project_binding TO hub_reader;
GRANT SELECT, INSERT ON connector.connection TO hub_command;
GRANT UPDATE (disabled_at, disabled_by) ON connector.connection TO hub_command;
GRANT SELECT, INSERT, DELETE ON connector.project_binding TO hub_command;
GRANT UPDATE (unbound_at, unbound_by) ON connector.project_binding TO hub_command;

-- The Connector functions were the only reason connector_owner read the Project table.
ALTER POLICY legacy_owner ON project.project TO iam_owner;
REVOKE SELECT (project_id), SELECT (workspace_id), SELECT (archived), REFERENCES ON project.project FROM connector_owner;

REVOKE EXECUTE ON FUNCTION connector.purge_project(uuid) FROM hub_command;

DROP FUNCTION connector.admit_installation_administrator(uuid);
DROP FUNCTION connector.admit_project_owner(uuid, uuid);
DROP FUNCTION connector.bind_connection(uuid, uuid, uuid, text);
DROP FUNCTION connector.create_connection(uuid, uuid, uuid, text, text, text, text[]);
DROP FUNCTION connector.disable_connection(uuid, uuid, uuid);
DROP FUNCTION connector.list_bound_connections(uuid, text);
DROP FUNCTION connector.list_connections(uuid, uuid);
DROP FUNCTION connector.list_project_bindings(uuid, uuid);
DROP FUNCTION connector.purge_project(uuid);
DROP FUNCTION connector.read_connection_credential(uuid);
DROP FUNCTION connector.unbind_connection(uuid, uuid, uuid);

COMMIT;
