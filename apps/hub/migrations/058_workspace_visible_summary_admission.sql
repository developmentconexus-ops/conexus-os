BEGIN;

-- The shell's Workspace list ran, from the Hub's workspace-read pool, a statement that called
-- iam.visible_workspaces itself and handed the resulting id array to
-- workspace.list_workspace_summaries. hub_s2_read holds no EXECUTE on iam.visible_workspaces, so
-- every signed-in account got 42501 instead of a list. Admission belongs inside the callee: a
-- data function takes the account id and joins iam.visible_workspaces in its own body, as
-- workspace.get_workspace_summary already does for the single-Workspace read, and the Hub's
-- workspace-read pool never names an iam function again.

SET LOCAL ROLE workspace_owner;

CREATE FUNCTION workspace.list_visible_workspace_summaries(p_account_id uuid)
RETURNS TABLE(workspace_id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT stored_workspace.workspace_id, stored_workspace.name
  FROM workspace.workspace AS stored_workspace
  JOIN iam.visible_workspaces(p_account_id) AS visible
    ON visible.workspace_id = stored_workspace.workspace_id;
$$;

-- A summary reader that accepts an already-admitted id array trusts whatever its caller assembled.
-- Nothing calls it once the Hub asks the function above, and leaving it standing would leave the
-- shape the membership work removed available to the next call site.
DROP FUNCTION workspace.list_workspace_summaries(uuid[]);

RESET ROLE;

REVOKE ALL ON FUNCTION workspace.list_visible_workspace_summaries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workspace.list_visible_workspace_summaries(uuid) TO hub_s2_read;

COMMIT;
