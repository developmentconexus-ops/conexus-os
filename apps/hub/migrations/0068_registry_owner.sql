BEGIN;

REVOKE EXECUTE ON FUNCTION reg.matches_application_artifact(uuid, text, uuid, text) FROM hub_command;
REVOKE EXECUTE ON FUNCTION reg.purge_project(uuid) FROM hub_command;
REVOKE EXECUTE ON FUNCTION reg.get_served_application(uuid, uuid), reg.read_served_application_file(uuid, uuid, uuid, text), reg.get_application_thumbnail(uuid, uuid) FROM hub_reader;

DROP FUNCTION reg.get_application_by_source(p_account_id uuid, p_project_id uuid, p_source_revision text);
DROP FUNCTION reg.get_application_thumbnail(p_account_id uuid, p_project_id uuid);
DROP FUNCTION reg.get_served_application(p_account_id uuid, p_project_id uuid);
DROP FUNCTION reg.matches_application_artifact(p_project_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_artifact_digest text);
DROP FUNCTION reg.purge_project(p_project_id uuid);
DROP FUNCTION reg.read_application_file_by_source(p_account_id uuid, p_project_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_path text);
DROP FUNCTION reg.read_served_application_file(p_account_id uuid, p_project_id uuid, p_artifact_revision_id uuid, p_path text);
DROP FUNCTION reg.retain_application_execution(p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text, p_payload jsonb);
DROP FUNCTION reg.retain_application_thumbnail(p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_media_type text, p_bytes bytea);
DROP FUNCTION builder.admit_verified_application_source(p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text);
DROP FUNCTION builder.served_preview_revision(p_project_id uuid);

-- Those two functions were the last readers the Builder tables kept a bridge for.
DROP POLICY legacy_owner ON builder.builder_run;
DROP POLICY legacy_owner ON builder.project_working_state;

-- The revision key (artifact_id, artifact_revision_id) is held by this key, so it goes first.
ALTER TABLE reg.artifact DROP CONSTRAINT artifact_published_revision_fkey;

-- A revision carries its Project; the parent row, the availability column that held one value and the digest key go.
ALTER TABLE reg.artifact_revision
  ADD COLUMN project_id uuid NOT NULL,
  ADD CONSTRAINT artifact_revision_project_id_fkey FOREIGN KEY (project_id) REFERENCES project.project (project_id) ON DELETE RESTRICT;
ALTER TABLE reg.artifact_revision
  DROP CONSTRAINT artifact_revision_artifact_id_artifact_revision_id_key,
  DROP CONSTRAINT artifact_revision_artifact_id_digest_key,
  DROP CONSTRAINT artifact_revision_artifact_id_source_revision_key,
  DROP CONSTRAINT artifact_revision_artifact_id_fkey,
  DROP CONSTRAINT artifact_revision_availability_check,
  DROP COLUMN artifact_id,
  DROP COLUMN availability,
  ADD CONSTRAINT artifact_revision_project_id_source_revision_key UNIQUE (project_id, source_revision);
DROP TABLE reg.artifact;

-- The thumbnail follows its revision: one row per revision, deleted with it.
ALTER TABLE reg.application_thumbnail
  DROP CONSTRAINT application_thumbnail_pkey,
  DROP COLUMN project_id,
  ADD CONSTRAINT application_thumbnail_pkey PRIMARY KEY (artifact_revision_id),
  ADD CONSTRAINT application_thumbnail_revision_fkey FOREIGN KEY (artifact_revision_id) REFERENCES reg.artifact_revision (artifact_revision_id) ON DELETE CASCADE;

ALTER TABLE reg.artifact_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE reg.artifact_revision FORCE ROW LEVEL SECURITY;
ALTER TABLE reg.application_thumbnail ENABLE ROW LEVEL SECURITY;
ALTER TABLE reg.application_thumbnail FORCE ROW LEVEL SECURITY;

CREATE POLICY reader ON reg.artifact_revision FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND project_id IN (SELECT visible.project_id FROM project.project AS visible));
CREATE POLICY reader ON reg.application_thumbnail FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND artifact_revision_id IN (SELECT revision.artifact_revision_id FROM reg.artifact_revision AS revision));
CREATE POLICY command ON reg.artifact_revision TO hub_command USING (true) WITH CHECK (true);
CREATE POLICY command ON reg.application_thumbnail TO hub_command USING (true) WITH CHECK (true);

GRANT SELECT ON reg.artifact_revision, reg.application_thumbnail TO hub_reader;
GRANT SELECT, INSERT, DELETE ON reg.artifact_revision TO hub_command;
GRANT SELECT, INSERT ON reg.application_thumbnail TO hub_command;

-- The functions were the only reason registry_owner read these.
REVOKE EXECUTE ON FUNCTION iam.visible_projects(uuid), iam.has_application_access(uuid, uuid) FROM registry_owner;
REVOKE REFERENCES ON project.project, workspace.workspace FROM registry_owner;

-- Its function grants went with the dropped functions; the schema usage is all it still holds, and a dependency left behind fails the DROP.
REVOKE USAGE ON SCHEMA builder, reg FROM hub_builder_executor;
DROP ROLE hub_builder_executor;

COMMIT;
