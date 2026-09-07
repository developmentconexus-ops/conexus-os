BEGIN;

-- BRN-02's purpose-bound alternate disclosure is a read-only selection
-- admission. It deliberately does not reuse the locking Brain-binding
-- mutation preflight or imply ordinary brain.read.
SET LOCAL ROLE iam_owner;

CREATE FUNCTION iam.admit_brain_revision_selection(
  p_account_id uuid,
  p_project_id uuid,
  p_workspace_id uuid
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
    target.workspace_id = p_workspace_id
      AND project_grant.account_id IS NOT NULL
      AND membership.account_id IS NOT NULL,
    target.workspace_id = p_workspace_id
      AND project_grant.account_id IS NOT NULL
      AND membership.account_id IS NOT NULL
      AND project_grant.can_manage
      AND project_grant.can_bind_brain
  FROM (
    SELECT stored_project.project_id, stored_project.workspace_id
    FROM project.project AS stored_project
    WHERE stored_project.project_id = p_project_id
  ) AS target
  LEFT JOIN iam.account_project_grant AS project_grant
    ON project_grant.account_id = p_account_id
    AND project_grant.project_id = target.project_id
  LEFT JOIN iam.workspace_membership AS membership
    ON membership.account_id = p_account_id
    AND membership.workspace_id = target.workspace_id
  WHERE target.workspace_id = p_workspace_id;
$$;

REVOKE EXECUTE ON FUNCTION iam.admit_brain_revision_selection(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam.admit_brain_revision_selection(uuid, uuid, uuid) TO hub_r2_brain_read;

RESET ROLE;
COMMIT;
