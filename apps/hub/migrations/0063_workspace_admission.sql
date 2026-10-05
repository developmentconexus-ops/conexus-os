BEGIN;

ALTER TABLE workspace.workspace ADD COLUMN created_by uuid REFERENCES iam.account;
UPDATE workspace.workspace AS workspace_row SET created_by = (
  SELECT membership.account_id FROM iam.workspace_membership AS membership
  WHERE membership.workspace_id = workspace_row.workspace_id AND membership.role = 'owner'
  ORDER BY membership.created_at, membership.account_id LIMIT 1
);
ALTER TABLE workspace.workspace ALTER COLUMN created_by SET NOT NULL;

GRANT USAGE ON SCHEMA iam TO iam_rls;
GRANT SELECT ON iam.account, iam.workspace_membership, iam.installation_administrator,
  iam.application_grant TO iam_rls;

CREATE FUNCTION iam.acting_account() RETURNS uuid LANGUAGE sql STABLE
SET search_path TO pg_catalog, pg_temp AS $$
  SELECT nullif(current_setting('conexus.account_id', true), '')::uuid;
$$;
ALTER FUNCTION iam.acting_account() OWNER TO iam_rls;

CREATE FUNCTION iam.acting_scope() RETURNS text LANGUAGE sql STABLE
SET search_path TO pg_catalog, pg_temp AS $$
  SELECT nullif(current_setting('conexus.scope', true), '');
$$;
ALTER FUNCTION iam.acting_scope() OWNER TO iam_rls;

CREATE FUNCTION iam.acting_workspaces() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, pg_temp AS $$
  SELECT membership.workspace_id
  FROM iam.workspace_membership AS membership
  JOIN iam.account AS account ON account.account_id = membership.account_id
  WHERE membership.account_id = iam.acting_account() AND account.active;
$$;
ALTER FUNCTION iam.acting_workspaces() OWNER TO iam_rls;

CREATE FUNCTION iam.acting_installation_administrator() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM iam.installation_administrator AS tenure
    JOIN iam.account AS account ON account.account_id = tenure.account_id AND account.active
    WHERE tenure.account_id = iam.acting_account() AND tenure.revoked_at IS NULL
  );
$$;
ALTER FUNCTION iam.acting_installation_administrator() OWNER TO iam_rls;

CREATE FUNCTION iam.acting_applications() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, pg_temp AS $$
  SELECT grant_row.project_id FROM iam.application_grant AS grant_row
  JOIN iam.account AS account ON account.account_id = grant_row.account_id AND account.active
  WHERE grant_row.account_id = iam.acting_account() AND grant_row.revoked_at IS NULL;
$$;
ALTER FUNCTION iam.acting_applications() OWNER TO iam_rls;

REVOKE ALL ON FUNCTION iam.acting_account(), iam.acting_scope(), iam.acting_workspaces(),
  iam.acting_installation_administrator(), iam.acting_applications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam.acting_account(), iam.acting_scope(), iam.acting_workspaces(),
  iam.acting_installation_administrator(), iam.acting_applications() TO hub_runtime;

ALTER TABLE workspace.workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace.workspace FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_runtime ON workspace.workspace FOR ALL TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system' OR workspace_id IN (SELECT iam.acting_workspaces()))
  WITH CHECK ((SELECT iam.acting_scope()) = 'system'
    OR workspace_id IN (SELECT iam.acting_workspaces())
    OR ((SELECT iam.acting_account()) IS NOT NULL AND created_by = (SELECT iam.acting_account())));
CREATE POLICY legacy_owner ON workspace.workspace FOR ALL TO workspace_owner
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace.workspace TO hub_runtime;

ALTER TABLE platform.operation_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.operation_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY receipt_runtime ON platform.operation_receipt FOR ALL TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system'
    OR ((SELECT iam.acting_account()) IS NOT NULL AND account_id = (SELECT iam.acting_account())))
  WITH CHECK ((SELECT iam.acting_scope()) = 'system'
    OR ((SELECT iam.acting_account()) IS NOT NULL AND account_id = (SELECT iam.acting_account())));

GRANT SELECT, INSERT, UPDATE (role) ON iam.workspace_membership TO hub_runtime;
GRANT SELECT ON iam.account TO hub_runtime;

DROP FUNCTION workspace.complete_create_workspace_receipt(uuid, text, integer, text, jsonb);
DROP FUNCTION workspace.reserve_or_replay_create_workspace(uuid, text, text, uuid);
DROP FUNCTION workspace.create_workspace(uuid, text, uuid);
DROP FUNCTION workspace.list_visible_workspace_summaries(uuid);
DROP FUNCTION iam.establish_workspace_creator_access(uuid, uuid);
DROP TABLE workspace.operation_idempotency;

COMMIT;
