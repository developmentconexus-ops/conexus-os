BEGIN;

DROP TRIGGER builder_run_phase_boundary ON builder.builder_run;
DROP FUNCTION builder.clear_builder_run_phase();
DROP FUNCTION builder.admit_source_revision(p_account_id uuid, p_project_id uuid, p_source_revision text, p_main_revision text);
DROP FUNCTION builder.advance_builder_run_source(p_builder_run_id uuid, p_source_revision text);
DROP FUNCTION builder.bind_builder_run_message(p_builder_run_id uuid, p_message_id text);
DROP FUNCTION builder.bind_builder_run_sandbox(p_builder_run_id uuid, p_sandbox_id text);
DROP FUNCTION builder.claim_builder_run(p_builder_run_id uuid, p_owner_id uuid);
DROP FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_builder_run_id uuid, p_base_source_revision text);
DROP FUNCTION builder.fail_builder_run(p_builder_run_id uuid, p_failure_code text);
DROP FUNCTION builder.interrupt_builder_run(p_builder_run_id uuid, p_reason text);
DROP FUNCTION builder.list_builder_runs(p_account_id uuid, p_project_id uuid, p_limit integer);
DROP FUNCTION builder.lock_project_for_run(p_account_id uuid, p_project_id uuid);
DROP FUNCTION builder.purge_project(p_project_id uuid);
DROP FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid);
DROP FUNCTION builder.read_conversation_sandbox(p_project_id uuid, p_conversation_id uuid);
DROP FUNCTION builder.read_latest_code_changing_builder_run(p_account_id uuid, p_project_id uuid);
DROP FUNCTION builder.read_open_run_conversations();
DROP FUNCTION builder.read_preview_subject(p_account_id uuid, p_project_id uuid);
DROP FUNCTION builder.read_project_sandboxes(p_project_id uuid);
DROP FUNCTION builder.record_builder_run_candidate(p_builder_run_id uuid, p_source_revision text);
DROP FUNCTION builder.record_builder_run_model_account(p_builder_run_id uuid, p_model_account_id uuid);
DROP FUNCTION builder.record_conversation_sandbox(p_project_id uuid, p_conversation_id uuid, p_provider_sandbox_id text);
DROP FUNCTION builder.record_conversation_session(p_project_id uuid, p_conversation_id uuid, p_mirror_head text, p_synced_main text, p_turn_ended boolean);
DROP FUNCTION builder.register_project_repository(p_project_id uuid);
DROP FUNCTION builder.renew_run_lease(p_owner_id uuid, p_live_run_ids uuid[], p_stale_after_ms integer);
DROP FUNCTION builder.request_builder_run_cancellation(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid);
DROP FUNCTION builder.run_summary(run builder.builder_run);
DROP FUNCTION builder.set_builder_run_phase(p_builder_run_id uuid, p_phase text);
DROP FUNCTION builder.settle_builder_run(p_builder_run_id uuid, p_result_source_revision text, p_result_kind text, p_failure_code text);
DROP FUNCTION builder.settle_builder_run_build(p_builder_run_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_artifact_digest text, p_failure_code text);

ALTER TABLE builder.builder_run
  ADD CONSTRAINT builder_run_account_id_fkey FOREIGN KEY (account_id) REFERENCES iam.account (account_id) ON DELETE RESTRICT;
CREATE INDEX conversation_session_project_id_idx ON builder.conversation_session (project_id);

ALTER TABLE builder.project_repository ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.project_repository FORCE ROW LEVEL SECURITY;
ALTER TABLE builder.conversation_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.conversation_session FORCE ROW LEVEL SECURITY;
ALTER TABLE builder.builder_run_model_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.builder_run_model_account FORCE ROW LEVEL SECURITY;

CREATE POLICY reader ON builder.conversation_session FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND project_id IN (SELECT visible.project_id FROM project.project AS visible));
CREATE POLICY command ON builder.project_repository TO hub_command USING (true) WITH CHECK (true);
CREATE POLICY command ON builder.conversation_session TO hub_command USING (true) WITH CHECK (true);
CREATE POLICY command ON builder.builder_run_model_account TO hub_command USING (true) WITH CHECK (true);

REVOKE ALL ON builder.project_repository, builder.conversation_session, builder.builder_run_model_account FROM hub_runtime;

GRANT SELECT ON builder.conversation_session TO hub_reader;
GRANT INSERT, DELETE, UPDATE (state, phase, started_at, finished_at, owner_id, heartbeat_at, failure_code,
  cancellation_requested_at, cancellation_reason, trigger_message_id, sandbox_id, candidate_revision,
  result_source_revision, result_kind) ON builder.builder_run TO hub_command;
GRANT INSERT, DELETE, UPDATE (current_state, last_preview_source_revision, last_preview_artifact_revision_id,
  last_preview_artifact_digest, updated_at) ON builder.project_working_state TO hub_command;
GRANT SELECT, INSERT, DELETE ON builder.project_repository TO hub_command;
GRANT SELECT, INSERT, UPDATE (provider_sandbox_id, mirror_head, synced_main, last_turn_ended_at) ON builder.conversation_session TO hub_command;
GRANT SELECT, INSERT ON builder.builder_run_model_account TO hub_command;
GRANT EXECUTE ON FUNCTION reg.matches_application_artifact(uuid, text, uuid, text) TO hub_command;

ALTER TABLE builder.builder_run DROP CONSTRAINT builder_run_conversation_id_check;
ALTER TABLE builder.builder_run ALTER COLUMN conversation_id TYPE uuid USING conversation_id::uuid;

COMMIT;
