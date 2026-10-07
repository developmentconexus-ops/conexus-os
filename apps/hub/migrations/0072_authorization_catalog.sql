BEGIN;

UPDATE builder.builder_run
SET failure_code = 'INTERNAL_UNEXPECTED'
WHERE failure_code = 'PROJECT_CREATE_DENIED';

COMMIT;
