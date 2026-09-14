BEGIN;

SET LOCAL ROLE builder_owner;

ALTER TABLE builder.project_working_state
  DROP CONSTRAINT IF EXISTS project_working_state_idle_check,
  DROP CONSTRAINT IF EXISTS project_working_state_preparation_check;

-- C-020 does not create a legacy Change or preparation attempt. Keep the
-- legacy pair invariant for active coding/preparation while allowing the
-- durable Preview/failure states to be owned by BuilderRun alone.
ALTER TABLE builder.project_working_state
  ADD CONSTRAINT project_working_state_current_state_consistency_check
    CHECK (
      (current_state = 'IDLE'
        AND current_change_id IS NULL AND current_account_id IS NULL)
      OR (current_state IN ('CODING', 'PREPARING')
        AND current_change_id IS NOT NULL AND current_account_id IS NOT NULL)
      OR current_state IN ('PREVIEW_READY', 'BUILD_FAILED', 'RESPONDED')
    ),
  ADD CONSTRAINT project_working_state_preparing_check
    CHECK (current_state <> 'PREPARING' OR preparation_attempt_id IS NOT NULL);

RESET ROLE;
COMMIT;
