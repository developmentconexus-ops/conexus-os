BEGIN;

CREATE TABLE reg.project_preview (
  project_id uuid PRIMARY KEY REFERENCES project.project(project_id),
  source_revision text NOT NULL CHECK (source_revision ~ '^[0-9a-f]{40}$'),
  artifact_revision_id uuid NOT NULL,
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$')
);
ALTER TABLE reg.project_preview OWNER TO conexus_owner;
GRANT SELECT, INSERT, DELETE, UPDATE (source_revision, artifact_revision_id, digest)
  ON reg.project_preview TO hub_runtime;

INSERT INTO reg.project_preview (project_id, source_revision, artifact_revision_id, digest)
SELECT project_id, last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest
FROM builder.project_working_state WHERE last_preview_source_revision IS NOT NULL;

ALTER TABLE builder.project_working_state
  DROP COLUMN last_preview_source_revision,
  DROP COLUMN last_preview_artifact_revision_id,
  DROP COLUMN last_preview_artifact_digest;

COMMIT;
