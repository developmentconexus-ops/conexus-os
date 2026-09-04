BEGIN;

DO $$ BEGIN
  CREATE ROLE hub_s4_baseline_read LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_s4_baseline_command LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON SCHEMA iam, project, workspace FROM PUBLIC;
GRANT USAGE ON SCHEMA iam, project TO hub_s4_baseline_read, hub_s4_baseline_command;

SET LOCAL ROLE iam_owner;

CREATE FUNCTION iam.admit_project_manage(
  p_account_id uuid,
  p_project_id uuid
) RETURNS TABLE(project_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT project_grant.project_id
  FROM iam.account_project_grant AS project_grant
  JOIN project.project AS stored_project
    ON stored_project.project_id = project_grant.project_id
  JOIN iam.workspace_membership AS membership
    ON membership.account_id = project_grant.account_id
    AND membership.workspace_id = stored_project.workspace_id
  WHERE membership.account_id = p_account_id
    AND project_grant.project_id = p_project_id
    AND project_grant.can_manage;
$$;

REVOKE EXECUTE ON FUNCTION iam.admit_project_manage(uuid, uuid) FROM PUBLIC;

RESET ROLE;
SET LOCAL ROLE project_owner;

CREATE TABLE project.baseline_candidate (
  project_id uuid NOT NULL REFERENCES project.project(project_id) ON DELETE RESTRICT,
  candidate_digest text NOT NULL CHECK (candidate_digest ~ '^[0-9a-f]{64}$'),
  source_revision text NOT NULL CHECK (source_revision ~ '\S'),
  source_text text NOT NULL CHECK (source_text ~ '\S'),
  application_runtime_profile text NOT NULL CHECK (application_runtime_profile IN ('MANAGED', 'DEDICATED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (project_id, candidate_digest)
);

CREATE TABLE project.baseline_state (
  project_id uuid PRIMARY KEY REFERENCES project.project(project_id) ON DELETE RESTRICT,
  current_candidate_digest text NOT NULL,
  approved_candidate_digest text,
  approval_revision uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (project_id, current_candidate_digest)
    REFERENCES project.baseline_candidate(project_id, candidate_digest) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, approved_candidate_digest)
    REFERENCES project.baseline_candidate(project_id, candidate_digest) ON DELETE RESTRICT,
  CHECK ((approved_candidate_digest IS NULL) = (approval_revision IS NULL))
);

CREATE TABLE project.baseline_approval (
  project_id uuid NOT NULL,
  candidate_digest text NOT NULL,
  approval_revision uuid NOT NULL UNIQUE,
  account_id uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (project_id, candidate_digest),
  FOREIGN KEY (project_id, candidate_digest)
    REFERENCES project.baseline_candidate(project_id, candidate_digest) ON DELETE RESTRICT
);

CREATE FUNCTION project.get_baseline_candidate(
  p_project_id uuid,
  p_candidate_digest text,
  p_admitted_project_ids uuid[]
) RETURNS TABLE(
  candidate_baseline_digest text,
  source_revision text,
  source_text text,
  application_runtime_profile text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT candidate.candidate_digest, candidate.source_revision,
    candidate.source_text, candidate.application_runtime_profile
  FROM project.baseline_candidate AS candidate
  WHERE candidate.project_id = p_project_id
    AND candidate.candidate_digest = p_candidate_digest
    AND candidate.project_id = ANY(p_admitted_project_ids);
$$;

CREATE FUNCTION project.get_approved_baseline(
  p_project_id uuid,
  p_admitted_project_ids uuid[]
) RETURNS TABLE(
  baseline_digest text,
  source_revision text,
  source_text text,
  application_runtime_profile text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT candidate.candidate_digest, candidate.source_revision,
    candidate.source_text, candidate.application_runtime_profile
  FROM project.baseline_state AS state
  JOIN project.baseline_candidate AS candidate
    ON candidate.project_id = state.project_id
    AND candidate.candidate_digest = state.approved_candidate_digest
  WHERE state.project_id = p_project_id
    AND state.project_id = ANY(p_admitted_project_ids);
$$;

CREATE FUNCTION project.approve_baseline_revision(
  p_account_id uuid,
  p_project_id uuid,
  p_candidate_digest text,
  p_approval_revision uuid,
  p_admitted_project_ids uuid[]
) RETURNS TABLE(
  baseline_digest text,
  source_revision text,
  source_text text,
  application_runtime_profile text,
  approval_revision uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  state project.baseline_state%ROWTYPE;
BEGIN
  IF NOT p_project_id = ANY(p_admitted_project_ids) THEN
    RAISE EXCEPTION 'PRJ09_APPROVAL_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO state
  FROM project.baseline_state AS stored_state
  WHERE stored_state.project_id = p_project_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRJ09_CANDIDATE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF state.current_candidate_digest <> p_candidate_digest THEN
    RAISE EXCEPTION 'PRJ09_STALE_CANDIDATE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO project.baseline_approval (
    project_id, candidate_digest, approval_revision, account_id
  ) VALUES (
    p_project_id, p_candidate_digest, p_approval_revision, p_account_id
  ) ON CONFLICT (project_id, candidate_digest) DO NOTHING;

  UPDATE project.baseline_state AS stored_state
  SET approved_candidate_digest = p_candidate_digest,
      approval_revision = approval.approval_revision,
      updated_at = clock_timestamp()
  FROM project.baseline_approval AS approval
  WHERE stored_state.project_id = p_project_id
    AND approval.project_id = p_project_id
    AND approval.candidate_digest = p_candidate_digest;

  RETURN QUERY
  SELECT candidate.candidate_digest, candidate.source_revision,
    candidate.source_text, candidate.application_runtime_profile,
    approval.approval_revision
  FROM project.baseline_candidate AS candidate
  JOIN project.baseline_approval AS approval
    ON approval.project_id = candidate.project_id
    AND approval.candidate_digest = candidate.candidate_digest
  WHERE candidate.project_id = p_project_id
    AND candidate.candidate_digest = p_candidate_digest;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA project FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.get_baseline_candidate(uuid, text, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.get_approved_baseline(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.approve_baseline_revision(uuid, uuid, text, uuid, uuid[]) FROM PUBLIC;

RESET ROLE;

GRANT EXECUTE ON FUNCTION iam.admit_project_manage(uuid, uuid)
  TO hub_s4_baseline_read, hub_s4_baseline_command;
GRANT EXECUTE ON FUNCTION project.get_baseline_candidate(uuid, text, uuid[])
  TO hub_s4_baseline_read;
GRANT EXECUTE ON FUNCTION project.get_approved_baseline(uuid, uuid[])
  TO hub_s4_baseline_read;
GRANT EXECUTE ON FUNCTION project.approve_baseline_revision(uuid, uuid, text, uuid, uuid[])
  TO hub_s4_baseline_command;

REVOKE ALL ON ALL TABLES IN SCHEMA iam FROM hub_s4_baseline_read;
REVOKE ALL ON ALL TABLES IN SCHEMA iam FROM hub_s4_baseline_command;
REVOKE ALL ON ALL TABLES IN SCHEMA project FROM hub_s4_baseline_read;
REVOKE ALL ON ALL TABLES IN SCHEMA project FROM hub_s4_baseline_command;
REVOKE ALL ON ALL TABLES IN SCHEMA workspace FROM hub_s4_baseline_read;
REVOKE ALL ON ALL TABLES IN SCHEMA workspace FROM hub_s4_baseline_command;

DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hub_s4_baseline_read, hub_s4_baseline_command', current_database());
END $$;

COMMIT;
