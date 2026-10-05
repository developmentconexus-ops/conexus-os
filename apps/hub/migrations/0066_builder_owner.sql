BEGIN;

ALTER TABLE builder.builder_run
  ADD CONSTRAINT builder_run_account_id_fkey FOREIGN KEY (account_id) REFERENCES iam.account (account_id) ON DELETE RESTRICT;
CREATE INDEX conversation_session_project_id_idx ON builder.conversation_session (project_id);

GRANT INSERT, DELETE, UPDATE (state, phase, started_at, finished_at, owner_id, heartbeat_at, failure_code,
  cancellation_requested_at, cancellation_reason, trigger_message_id, sandbox_id, candidate_revision,
  result_source_revision, result_kind) ON builder.builder_run TO hub_command;
GRANT INSERT, DELETE, UPDATE (current_state, last_preview_source_revision, last_preview_artifact_revision_id,
  last_preview_artifact_digest, updated_at) ON builder.project_working_state TO hub_command;

COMMIT;
