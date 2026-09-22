BEGIN;

-- The Projects home reads each Project's latest Builder activity and whether it has a good
-- Preview alongside its name and archived flag. builder.builder_run and
-- builder.project_working_state are builder_owner's tables; project_owner gets a narrow SELECT
-- grant on exactly those two so one function, in one query, can answer the whole workspace
-- instead of the Hub issuing one Builder read per Project.
GRANT SELECT ON TABLE builder.builder_run TO project_owner;
GRANT SELECT ON TABLE builder.project_working_state TO project_owner;

CREATE FUNCTION project.list_project_summaries_with_activity(p_account_id uuid, p_workspace_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'projectId', stored_project.project_id,
    'name', stored_project.name,
    'archived', stored_project.archived,
    'lastActivityAt', to_char(COALESCE(latest_run.created_at, stored_project.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'latestRun', CASE WHEN latest_run.builder_run_id IS NULL THEN NULL
      ELSE jsonb_build_object('state', latest_run.state, 'resultKind', latest_run.result_kind) END,
    'hasPreview', working.last_preview_source_revision IS NOT NULL
  ) ORDER BY COALESCE(latest_run.created_at, stored_project.created_at) DESC, stored_project.project_id), '[]'::jsonb)
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
  WHERE stored_project.workspace_id = p_workspace_id;
$$;

ALTER FUNCTION project.list_project_summaries_with_activity(p_account_id uuid, p_workspace_id uuid) OWNER TO project_owner;

REVOKE ALL ON FUNCTION project.list_project_summaries_with_activity(p_account_id uuid, p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION project.list_project_summaries_with_activity(p_account_id uuid, p_workspace_id uuid) TO hub_project_read;

COMMIT;
