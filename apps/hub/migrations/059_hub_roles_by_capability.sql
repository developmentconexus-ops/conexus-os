BEGIN;

-- The eight login roles and the one owner role below were named for the program phase that
-- introduced them. The register in contracts/technical/hub-database-roles.json already carries
-- what each one may do; the names now say the same thing.
--
-- Roles are cluster-global and this history is forward-only, SHA-pinned and replayed from zero in
-- every throwaway database on a shared cluster. ALTER ROLE ... RENAME would fail with 42710 on the
-- second database, because the old migrations re-create the old names; DROP ROLE would fail with
-- 2BP01 while another database on the cluster still grants to them. So this follows 055: the new
-- roles are created, every privilege the old ones hold in THIS database moves to them, and the old
-- names are left inert. The statements below are generated from the catalog of a database migrated
-- to 058, not written by hand.

DO $$ BEGIN
  CREATE ROLE hub_workspace_command LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_workspace_read LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_project_read LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_project_command LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_builder_ingress LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_builder_executor LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_model_connection LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE model_connection_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ownership moves as the migration user: the roles are NOINHERIT and no role is a member of
-- another, which docs/reference/data-and-persistence.md section 6.2 forbids, so no owner role can
-- reassign to another. ALTER ... OWNER TO rewrites the ACL entries naming the old owner, so every
-- grant below on a model_connection object is issued by the new owner. Indexes, TOAST relations
-- and each table's array type follow their table.
ALTER SCHEMA "model_connection" OWNER TO "model_connection_owner";
ALTER TABLE "model_connection"."authorization" OWNER TO "model_connection_owner";
ALTER TABLE "model_connection"."connection" OWNER TO "model_connection_owner";
ALTER TABLE "model_connection"."preference" OWNER TO "model_connection_owner";
ALTER TABLE "model_connection"."workspace_share" OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."admit_for_project"(p_account_id uuid, p_project_id uuid, p_provider_id text) OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."advance_generation"(p_connection_id uuid, p_expected_generation bigint, p_next_generation bigint) OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."complete_authorization"(p_authorization_id uuid) OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."consume_authorization"(p_account_id uuid, p_state_digest bytea) OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."fail_authorization"(p_authorization_id uuid) OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."list_connections"(p_account_id uuid) OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."publish_connection"(p_account_id uuid, p_connection_id uuid, p_provider_id text, p_credential_kind text, p_label text, p_generation bigint) OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."read_connection_credential"(p_connection_id uuid) OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."read_current_generation"(p_connection_id uuid) OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."revoke_connection"(p_account_id uuid, p_connection_id uuid) OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."select_connection"(p_account_id uuid, p_connection_id uuid) OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."share_connection"(p_owner_account_id uuid, p_connection_id uuid, p_workspace_id uuid) OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."start_authorization"(p_authorization_id uuid, p_account_id uuid, p_state_digest bytea, p_pkce_verifier text, p_expires_at timestamp with time zone) OWNER TO "model_connection_owner";
ALTER FUNCTION "model_connection"."unshare_connection"(p_actor_account_id uuid, p_connection_id uuid, p_workspace_id uuid) OWNER TO "model_connection_owner";

SET LOCAL ROLE builder_owner;
GRANT USAGE ON SCHEMA "builder" TO "hub_builder_executor";
REVOKE USAGE ON SCHEMA "builder" FROM "hub_rb_executor";
GRANT USAGE ON SCHEMA "builder" TO "hub_builder_ingress";
REVOKE USAGE ON SCHEMA "builder" FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "builder"."admit_source_revision"(p_account_id uuid, p_project_id uuid, p_source_revision text) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "builder"."admit_source_revision"(p_account_id uuid, p_project_id uuid, p_source_revision text) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "builder"."advance_builder_run_source"(p_builder_run_id uuid, p_source_revision text) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "builder"."advance_builder_run_source"(p_builder_run_id uuid, p_source_revision text) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "builder"."bind_builder_run_message"(p_builder_run_id uuid, p_message_id text) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "builder"."bind_builder_run_message"(p_builder_run_id uuid, p_message_id text) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "builder"."bind_builder_run_sandbox"(p_builder_run_id uuid, p_sandbox_id text) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "builder"."bind_builder_run_sandbox"(p_builder_run_id uuid, p_sandbox_id text) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "builder"."claim_builder_run"(p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "builder"."claim_builder_run"(p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "builder"."create_builder_run"(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_provider_id text) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "builder"."create_builder_run"(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_provider_id text) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "builder"."create_builder_run_with_model"(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "builder"."create_builder_run_with_model"(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "builder"."fail_builder_run"(p_builder_run_id uuid, p_failure_code text) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "builder"."fail_builder_run"(p_builder_run_id uuid, p_failure_code text) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "builder"."interrupt_builder_run"(p_builder_run_id uuid, p_reason text) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "builder"."interrupt_builder_run"(p_builder_run_id uuid, p_reason text) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "builder"."list_builder_runs"(p_account_id uuid, p_project_id uuid, p_limit integer) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "builder"."list_builder_runs"(p_account_id uuid, p_project_id uuid, p_limit integer) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "builder"."read_builder_run"(p_account_id uuid, p_project_id uuid) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "builder"."read_builder_run"(p_account_id uuid, p_project_id uuid) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "builder"."read_latest_code_changing_builder_run"(p_account_id uuid, p_project_id uuid) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "builder"."read_latest_code_changing_builder_run"(p_account_id uuid, p_project_id uuid) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "builder"."read_preview_subject"(p_account_id uuid, p_project_id uuid) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "builder"."read_preview_subject"(p_account_id uuid, p_project_id uuid) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "builder"."recover_builder_runs"() TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "builder"."recover_builder_runs"() FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "builder"."request_builder_run_cancellation"(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "builder"."request_builder_run_cancellation"(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "builder"."set_builder_run_phase"(p_builder_run_id uuid, p_phase text) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "builder"."set_builder_run_phase"(p_builder_run_id uuid, p_phase text) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "builder"."settle_builder_run"(p_builder_run_id uuid, p_result_source_revision text, p_result_kind text, p_failure_code text) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "builder"."settle_builder_run"(p_builder_run_id uuid, p_result_source_revision text, p_result_kind text, p_failure_code text) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "builder"."settle_builder_run_build"(p_builder_run_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_artifact_digest text, p_failure_code text) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "builder"."settle_builder_run_build"(p_builder_run_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_artifact_digest text, p_failure_code text) FROM "hub_rb_executor";

SET LOCAL ROLE iam_owner;
GRANT USAGE ON SCHEMA "iam" TO "model_connection_owner";
REVOKE USAGE ON SCHEMA "iam" FROM "claude_connection_owner";
GRANT USAGE ON SCHEMA "iam" TO "hub_project_command";
REVOKE USAGE ON SCHEMA "iam" FROM "hub_prj03_command";
GRANT USAGE ON SCHEMA "iam" TO "hub_model_connection";
REVOKE USAGE ON SCHEMA "iam" FROM "hub_r2_connections";
GRANT USAGE ON SCHEMA "iam" TO "hub_workspace_read";
REVOKE USAGE ON SCHEMA "iam" FROM "hub_s2_read";
GRANT USAGE ON SCHEMA "iam" TO "hub_project_read";
REVOKE USAGE ON SCHEMA "iam" FROM "hub_s3_read";
GRANT USAGE ON SCHEMA "iam" TO "hub_workspace_command";
REVOKE USAGE ON SCHEMA "iam" FROM "hub_ws01_command";
GRANT EXECUTE ON FUNCTION "iam"."account_is_active"(p_account_id uuid) TO "model_connection_owner";
REVOKE EXECUTE ON FUNCTION "iam"."account_is_active"(p_account_id uuid) FROM "claude_connection_owner";
GRANT EXECUTE ON FUNCTION "iam"."admit_project"(p_account_id uuid, p_project_id uuid, p_action iam.action) TO "model_connection_owner";
REVOKE EXECUTE ON FUNCTION "iam"."admit_project"(p_account_id uuid, p_project_id uuid, p_action iam.action) FROM "claude_connection_owner";
GRANT EXECUTE ON FUNCTION "iam"."admit_workspace"(p_account_id uuid, p_workspace_id uuid, p_action iam.action) TO "model_connection_owner";
REVOKE EXECUTE ON FUNCTION "iam"."admit_workspace"(p_account_id uuid, p_workspace_id uuid, p_action iam.action) FROM "claude_connection_owner";
GRANT EXECUTE ON FUNCTION "iam"."establish_workspace_creator_access"(p_account_id uuid, p_workspace_id uuid) TO "hub_workspace_command";
REVOKE EXECUTE ON FUNCTION "iam"."establish_workspace_creator_access"(p_account_id uuid, p_workspace_id uuid) FROM "hub_ws01_command";
GRANT EXECUTE ON FUNCTION "iam"."visible_projects"(p_account_id uuid) TO "model_connection_owner";
REVOKE EXECUTE ON FUNCTION "iam"."visible_projects"(p_account_id uuid) FROM "claude_connection_owner";
GRANT EXECUTE ON FUNCTION "iam"."visible_workspaces"(p_account_id uuid) TO "model_connection_owner";
REVOKE EXECUTE ON FUNCTION "iam"."visible_workspaces"(p_account_id uuid) FROM "claude_connection_owner";

SET LOCAL ROLE model_connection_owner;
GRANT USAGE ON SCHEMA "model_connection" TO "hub_model_connection";
REVOKE USAGE ON SCHEMA "model_connection" FROM "hub_r2_connections";
GRANT USAGE ON SCHEMA "model_connection" TO "hub_builder_executor";
REVOKE USAGE ON SCHEMA "model_connection" FROM "hub_rb_executor";
GRANT USAGE ON SCHEMA "model_connection" TO "hub_builder_ingress";
REVOKE USAGE ON SCHEMA "model_connection" FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."admit_for_project"(p_account_id uuid, p_project_id uuid, p_provider_id text) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."admit_for_project"(p_account_id uuid, p_project_id uuid, p_provider_id text) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."admit_for_project"(p_account_id uuid, p_project_id uuid, p_provider_id text) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."admit_for_project"(p_account_id uuid, p_project_id uuid, p_provider_id text) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."admit_for_project"(p_account_id uuid, p_project_id uuid, p_provider_id text) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."admit_for_project"(p_account_id uuid, p_project_id uuid, p_provider_id text) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."advance_generation"(p_connection_id uuid, p_expected_generation bigint, p_next_generation bigint) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."advance_generation"(p_connection_id uuid, p_expected_generation bigint, p_next_generation bigint) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."advance_generation"(p_connection_id uuid, p_expected_generation bigint, p_next_generation bigint) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."advance_generation"(p_connection_id uuid, p_expected_generation bigint, p_next_generation bigint) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."advance_generation"(p_connection_id uuid, p_expected_generation bigint, p_next_generation bigint) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."advance_generation"(p_connection_id uuid, p_expected_generation bigint, p_next_generation bigint) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."complete_authorization"(p_authorization_id uuid) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."complete_authorization"(p_authorization_id uuid) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."complete_authorization"(p_authorization_id uuid) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."complete_authorization"(p_authorization_id uuid) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."complete_authorization"(p_authorization_id uuid) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."complete_authorization"(p_authorization_id uuid) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."consume_authorization"(p_account_id uuid, p_state_digest bytea) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."consume_authorization"(p_account_id uuid, p_state_digest bytea) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."consume_authorization"(p_account_id uuid, p_state_digest bytea) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."consume_authorization"(p_account_id uuid, p_state_digest bytea) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."consume_authorization"(p_account_id uuid, p_state_digest bytea) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."consume_authorization"(p_account_id uuid, p_state_digest bytea) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."fail_authorization"(p_authorization_id uuid) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."fail_authorization"(p_authorization_id uuid) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."fail_authorization"(p_authorization_id uuid) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."fail_authorization"(p_authorization_id uuid) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."fail_authorization"(p_authorization_id uuid) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."fail_authorization"(p_authorization_id uuid) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."list_connections"(p_account_id uuid) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."list_connections"(p_account_id uuid) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."list_connections"(p_account_id uuid) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."list_connections"(p_account_id uuid) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."list_connections"(p_account_id uuid) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."list_connections"(p_account_id uuid) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."publish_connection"(p_account_id uuid, p_connection_id uuid, p_provider_id text, p_credential_kind text, p_label text, p_generation bigint) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."publish_connection"(p_account_id uuid, p_connection_id uuid, p_provider_id text, p_credential_kind text, p_label text, p_generation bigint) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."publish_connection"(p_account_id uuid, p_connection_id uuid, p_provider_id text, p_credential_kind text, p_label text, p_generation bigint) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."publish_connection"(p_account_id uuid, p_connection_id uuid, p_provider_id text, p_credential_kind text, p_label text, p_generation bigint) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."publish_connection"(p_account_id uuid, p_connection_id uuid, p_provider_id text, p_credential_kind text, p_label text, p_generation bigint) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."publish_connection"(p_account_id uuid, p_connection_id uuid, p_provider_id text, p_credential_kind text, p_label text, p_generation bigint) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."read_connection_credential"(p_connection_id uuid) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."read_connection_credential"(p_connection_id uuid) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."read_connection_credential"(p_connection_id uuid) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."read_connection_credential"(p_connection_id uuid) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."read_connection_credential"(p_connection_id uuid) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."read_connection_credential"(p_connection_id uuid) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."read_current_generation"(p_connection_id uuid) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."read_current_generation"(p_connection_id uuid) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."read_current_generation"(p_connection_id uuid) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."read_current_generation"(p_connection_id uuid) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."read_current_generation"(p_connection_id uuid) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."read_current_generation"(p_connection_id uuid) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."revoke_connection"(p_account_id uuid, p_connection_id uuid) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."revoke_connection"(p_account_id uuid, p_connection_id uuid) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."revoke_connection"(p_account_id uuid, p_connection_id uuid) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."revoke_connection"(p_account_id uuid, p_connection_id uuid) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."revoke_connection"(p_account_id uuid, p_connection_id uuid) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."revoke_connection"(p_account_id uuid, p_connection_id uuid) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."select_connection"(p_account_id uuid, p_connection_id uuid) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."select_connection"(p_account_id uuid, p_connection_id uuid) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."select_connection"(p_account_id uuid, p_connection_id uuid) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."select_connection"(p_account_id uuid, p_connection_id uuid) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."select_connection"(p_account_id uuid, p_connection_id uuid) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."select_connection"(p_account_id uuid, p_connection_id uuid) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."share_connection"(p_owner_account_id uuid, p_connection_id uuid, p_workspace_id uuid) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."share_connection"(p_owner_account_id uuid, p_connection_id uuid, p_workspace_id uuid) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."share_connection"(p_owner_account_id uuid, p_connection_id uuid, p_workspace_id uuid) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."share_connection"(p_owner_account_id uuid, p_connection_id uuid, p_workspace_id uuid) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."share_connection"(p_owner_account_id uuid, p_connection_id uuid, p_workspace_id uuid) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."share_connection"(p_owner_account_id uuid, p_connection_id uuid, p_workspace_id uuid) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."start_authorization"(p_authorization_id uuid, p_account_id uuid, p_state_digest bytea, p_pkce_verifier text, p_expires_at timestamp with time zone) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."start_authorization"(p_authorization_id uuid, p_account_id uuid, p_state_digest bytea, p_pkce_verifier text, p_expires_at timestamp with time zone) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."start_authorization"(p_authorization_id uuid, p_account_id uuid, p_state_digest bytea, p_pkce_verifier text, p_expires_at timestamp with time zone) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."start_authorization"(p_authorization_id uuid, p_account_id uuid, p_state_digest bytea, p_pkce_verifier text, p_expires_at timestamp with time zone) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."start_authorization"(p_authorization_id uuid, p_account_id uuid, p_state_digest bytea, p_pkce_verifier text, p_expires_at timestamp with time zone) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."start_authorization"(p_authorization_id uuid, p_account_id uuid, p_state_digest bytea, p_pkce_verifier text, p_expires_at timestamp with time zone) FROM "hub_rb_ingress";
GRANT EXECUTE ON FUNCTION "model_connection"."unshare_connection"(p_actor_account_id uuid, p_connection_id uuid, p_workspace_id uuid) TO "hub_model_connection";
REVOKE EXECUTE ON FUNCTION "model_connection"."unshare_connection"(p_actor_account_id uuid, p_connection_id uuid, p_workspace_id uuid) FROM "hub_r2_connections";
GRANT EXECUTE ON FUNCTION "model_connection"."unshare_connection"(p_actor_account_id uuid, p_connection_id uuid, p_workspace_id uuid) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "model_connection"."unshare_connection"(p_actor_account_id uuid, p_connection_id uuid, p_workspace_id uuid) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "model_connection"."unshare_connection"(p_actor_account_id uuid, p_connection_id uuid, p_workspace_id uuid) TO "hub_builder_ingress";
REVOKE EXECUTE ON FUNCTION "model_connection"."unshare_connection"(p_actor_account_id uuid, p_connection_id uuid, p_workspace_id uuid) FROM "hub_rb_ingress";

SET LOCAL ROLE project_owner;
GRANT USAGE ON SCHEMA "project" TO "model_connection_owner";
REVOKE USAGE ON SCHEMA "project" FROM "claude_connection_owner";
GRANT USAGE ON SCHEMA "project" TO "hub_project_command";
REVOKE USAGE ON SCHEMA "project" FROM "hub_prj03_command";
GRANT USAGE ON SCHEMA "project" TO "hub_project_read";
REVOKE USAGE ON SCHEMA "project" FROM "hub_s3_read";
GRANT SELECT ON TABLE "project"."project" TO "model_connection_owner";
REVOKE SELECT ON TABLE "project"."project" FROM "claude_connection_owner";
GRANT EXECUTE ON FUNCTION "project"."claim_abandoned_create_project_attempt"(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_expired_before timestamp with time zone) TO "hub_project_command";
REVOKE EXECUTE ON FUNCTION "project"."claim_abandoned_create_project_attempt"(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_expired_before timestamp with time zone) FROM "hub_prj03_command";
GRANT EXECUTE ON FUNCTION "project"."claim_abandoned_create_project_attempt"(p_expired_before timestamp with time zone, p_limit integer) TO "hub_project_command";
REVOKE EXECUTE ON FUNCTION "project"."claim_abandoned_create_project_attempt"(p_expired_before timestamp with time zone, p_limit integer) FROM "hub_prj03_command";
GRANT EXECUTE ON FUNCTION "project"."complete_create_project_receipt"(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_response_status integer, p_response_digest text, p_response_body jsonb) TO "hub_project_command";
REVOKE EXECUTE ON FUNCTION "project"."complete_create_project_receipt"(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_response_status integer, p_response_digest text, p_response_body jsonb) FROM "hub_prj03_command";
GRANT EXECUTE ON FUNCTION "project"."create_project_with_source"(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_name text, p_source_mode text, p_source_revision text, p_project_revision text) TO "hub_project_command";
REVOKE EXECUTE ON FUNCTION "project"."create_project_with_source"(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_name text, p_source_mode text, p_source_revision text, p_project_revision text) FROM "hub_prj03_command";
GRANT EXECUTE ON FUNCTION "project"."get_project"(p_account_id uuid, p_project_id uuid) TO "hub_project_read";
REVOKE EXECUTE ON FUNCTION "project"."get_project"(p_account_id uuid, p_project_id uuid) FROM "hub_s3_read";
GRANT EXECUTE ON FUNCTION "project"."list_project_summaries"(p_account_id uuid, p_workspace_id uuid) TO "hub_project_read";
REVOKE EXECUTE ON FUNCTION "project"."list_project_summaries"(p_account_id uuid, p_workspace_id uuid) FROM "hub_s3_read";
GRANT EXECUTE ON FUNCTION "project"."lock_create_project_receipt"(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid) TO "hub_project_command";
REVOKE EXECUTE ON FUNCTION "project"."lock_create_project_receipt"(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid) FROM "hub_prj03_command";
GRANT EXECUTE ON FUNCTION "project"."reserve_or_replay_create_project"(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_candidate_project_id uuid) TO "hub_project_command";
REVOKE EXECUTE ON FUNCTION "project"."reserve_or_replay_create_project"(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_candidate_project_id uuid) FROM "hub_prj03_command";

SET LOCAL ROLE registry_owner;
GRANT USAGE ON SCHEMA "reg" TO "hub_builder_executor";
REVOKE USAGE ON SCHEMA "reg" FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "reg"."get_application_by_source"(p_account_id uuid, p_project_id uuid, p_source_revision text) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "reg"."get_application_by_source"(p_account_id uuid, p_project_id uuid, p_source_revision text) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "reg"."read_application_file_by_source"(p_account_id uuid, p_project_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_path text) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "reg"."read_application_file_by_source"(p_account_id uuid, p_project_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_path text) FROM "hub_rb_executor";
GRANT EXECUTE ON FUNCTION "reg"."retain_application_execution"(p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text, p_payload jsonb) TO "hub_builder_executor";
REVOKE EXECUTE ON FUNCTION "reg"."retain_application_execution"(p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text, p_payload jsonb) FROM "hub_rb_executor";

SET LOCAL ROLE workspace_owner;
GRANT USAGE ON SCHEMA "workspace" TO "hub_workspace_read";
REVOKE USAGE ON SCHEMA "workspace" FROM "hub_s2_read";
GRANT USAGE ON SCHEMA "workspace" TO "hub_workspace_command";
REVOKE USAGE ON SCHEMA "workspace" FROM "hub_ws01_command";
GRANT EXECUTE ON FUNCTION "workspace"."complete_create_workspace_receipt"(p_account_id uuid, p_key_digest text, p_response_status integer, p_response_digest text, p_response_body jsonb) TO "hub_workspace_command";
REVOKE EXECUTE ON FUNCTION "workspace"."complete_create_workspace_receipt"(p_account_id uuid, p_key_digest text, p_response_status integer, p_response_digest text, p_response_body jsonb) FROM "hub_ws01_command";
GRANT EXECUTE ON FUNCTION "workspace"."create_workspace"(p_workspace_id uuid, p_name text, p_creator_account_id uuid) TO "hub_workspace_command";
REVOKE EXECUTE ON FUNCTION "workspace"."create_workspace"(p_workspace_id uuid, p_name text, p_creator_account_id uuid) FROM "hub_ws01_command";
GRANT EXECUTE ON FUNCTION "workspace"."get_workspace_summary"(p_account_id uuid, p_workspace_id uuid) TO "hub_workspace_read";
REVOKE EXECUTE ON FUNCTION "workspace"."get_workspace_summary"(p_account_id uuid, p_workspace_id uuid) FROM "hub_s2_read";
GRANT EXECUTE ON FUNCTION "workspace"."list_visible_workspace_summaries"(p_account_id uuid) TO "hub_workspace_read";
REVOKE EXECUTE ON FUNCTION "workspace"."list_visible_workspace_summaries"(p_account_id uuid) FROM "hub_s2_read";
GRANT EXECUTE ON FUNCTION "workspace"."reserve_or_replay_create_workspace"(p_account_id uuid, p_key_digest text, p_request_digest text, p_candidate_workspace_id uuid) TO "hub_workspace_command";
REVOKE EXECUTE ON FUNCTION "workspace"."reserve_or_replay_create_workspace"(p_account_id uuid, p_key_digest text, p_request_digest text, p_candidate_workspace_id uuid) FROM "hub_ws01_command";

RESET ROLE;

-- CONNECT was granted on the database by the migration user in 019, which is the role running
-- this file, and the database's name is not known to a static script.
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hub_model_connection', current_database());
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM hub_r2_connections', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hub_builder_executor', current_database());
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM hub_rb_executor', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hub_builder_ingress', current_database());
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM hub_rb_ingress', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hub_workspace_read', current_database());
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM hub_s2_read', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hub_project_read', current_database());
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM hub_s3_read', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hub_workspace_command', current_database());
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM hub_ws01_command', current_database());
END $$;

-- After this migration the old names hold nothing in this database and own nothing in it, which
-- is the state 055 left its roles in. Asserted rather than assumed: a privilege left behind would
-- be a second door into the same data under a name nothing reads any more.
DO $$
DECLARE
  remaining text;
BEGIN
  SELECT string_agg(entry, ', ' ORDER BY entry) INTO remaining FROM (
    SELECT 'database ' || d.datname || ' ' || a.privilege_type || ' to ' || a.grantee::regrole::text AS entry
      FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a
      WHERE d.datname = current_database() AND a.grantee::regrole::text IN ('hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command', 'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner')
    UNION ALL
    SELECT 'schema ' || n.nspname || ' ' || a.privilege_type || ' to ' || a.grantee::regrole::text
      FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
      WHERE a.grantee::regrole::text IN ('hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command', 'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner')
    UNION ALL
    SELECT 'relation ' || n.nspname || '.' || c.relname || ' ' || a.privilege_type || ' to ' || a.grantee::regrole::text
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE a.grantee::regrole::text IN ('hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command', 'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner')
    UNION ALL
    SELECT 'column ' || n.nspname || '.' || c.relname || '.' || att.attname || ' ' || a.privilege_type || ' to ' || a.grantee::regrole::text
      FROM pg_attribute att JOIN pg_class c ON c.oid = att.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(att.attacl) a
      WHERE a.grantee::regrole::text IN ('hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command', 'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner')
    UNION ALL
    SELECT 'routine ' || n.nspname || '.' || p.proname || ' ' || a.privilege_type || ' to ' || a.grantee::regrole::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) a
      WHERE a.grantee::regrole::text IN ('hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command', 'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner')
    UNION ALL
    SELECT 'default_acl ' || coalesce(n.nspname, '') || ' ' || a.privilege_type || ' to ' || a.grantee::regrole::text
      FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      WHERE a.grantee::regrole::text IN ('hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command', 'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner') OR d.defaclrole::regrole::text IN ('hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command', 'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner')
    UNION ALL
    SELECT 'owns schema ' || n.nspname FROM pg_namespace n WHERE n.nspowner::regrole::text IN ('hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command', 'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner')
    UNION ALL
    SELECT 'owns relation ' || n.nspname || '.' || c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relowner::regrole::text IN ('hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command', 'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner')
    UNION ALL
    SELECT 'owns routine ' || n.nspname || '.' || p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proowner::regrole::text IN ('hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command', 'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner')
    UNION ALL
    SELECT 'owns type ' || n.nspname || '.' || t.typname
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typowner::regrole::text IN ('hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command', 'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner')
        AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid AND c.relkind <> 'c')
    UNION ALL
    SELECT 'membership ' || m.member::regrole::text || ' in ' || m.roleid::regrole::text
      FROM pg_auth_members m
      WHERE m.member::regrole::text IN ('hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command', 'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner') OR m.roleid::regrole::text IN ('hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command', 'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner')
  ) AS held;
  IF remaining IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_059_RETIRED_ROLE_STILL_HELD: %', remaining;
  END IF;
END $$;

COMMIT;
