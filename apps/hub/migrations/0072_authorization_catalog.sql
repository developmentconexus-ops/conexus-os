BEGIN;

-- A deletion that purged its Project and never completed cannot be finished any more: the purge and
-- the completion are one transaction now, and what it released outside the database is unknown.
-- The upgrade stops rather than complete it or invent a Project.
DO $migration$
DECLARE
  stranded text;
BEGIN
  SELECT string_agg(deletion.project_id::text, ', ' ORDER BY deletion.project_id)
  INTO stranded
  FROM project.project_deletion AS deletion
  WHERE deletion.completed_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM project.project AS stored WHERE stored.project_id = deletion.project_id);
  IF stranded IS NOT NULL THEN
    RAISE EXCEPTION 'PROJECT_DELETION_STRANDED: %', stranded;
  END IF;
END
$migration$;

UPDATE builder.builder_run
SET failure_code = 'INTERNAL_UNEXPECTED'
WHERE failure_code = 'PROJECT_CREATE_DENIED';

COMMIT;
