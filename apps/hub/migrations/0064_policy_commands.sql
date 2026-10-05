BEGIN;

DROP POLICY workspace_runtime ON workspace.workspace;
CREATE POLICY workspace_select ON workspace.workspace FOR SELECT TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system' OR workspace_id IN (SELECT iam.acting_workspaces()));
CREATE POLICY workspace_insert ON workspace.workspace FOR INSERT TO hub_runtime
  WITH CHECK ((SELECT iam.acting_scope()) = 'system'
    OR ((SELECT iam.acting_account()) IS NOT NULL AND created_by = (SELECT iam.acting_account())));
CREATE POLICY workspace_delete ON workspace.workspace FOR DELETE TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system');
REVOKE UPDATE ON workspace.workspace FROM hub_runtime;

DROP POLICY receipt_runtime ON platform.operation_receipt;
CREATE POLICY receipt_select ON platform.operation_receipt FOR SELECT TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system'
    OR ((SELECT iam.acting_account()) IS NOT NULL AND account_id = (SELECT iam.acting_account())));
CREATE POLICY receipt_insert ON platform.operation_receipt FOR INSERT TO hub_runtime
  WITH CHECK ((SELECT iam.acting_scope()) = 'system'
    OR ((SELECT iam.acting_account()) IS NOT NULL AND account_id = (SELECT iam.acting_account())));
CREATE POLICY receipt_update ON platform.operation_receipt FOR UPDATE TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system'
    OR ((SELECT iam.acting_account()) IS NOT NULL AND account_id = (SELECT iam.acting_account())))
  WITH CHECK ((SELECT iam.acting_scope()) = 'system'
    OR ((SELECT iam.acting_account()) IS NOT NULL AND account_id = (SELECT iam.acting_account())));
CREATE POLICY receipt_delete ON platform.operation_receipt FOR DELETE TO hub_runtime
  USING ((SELECT iam.acting_scope()) = 'system');

COMMIT;
