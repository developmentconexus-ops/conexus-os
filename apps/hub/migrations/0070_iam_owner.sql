BEGIN;

-- Rows the new shape cannot carry or would bring back to life. An ended session keeps its row with a
-- null token today, so dropping ended_at would make it live; a consumed state would become
-- consumable again once consumed_at is gone. Children go before their parents.
DELETE FROM iam.handoff
  WHERE kind = 'PREVIEW'
    OR parent_digest IN (SELECT token_digest FROM iam.host_session WHERE ended_at IS NOT NULL OR kind = 'PREVIEW');
DELETE FROM iam.host_session
  WHERE parent_digest IS NOT NULL AND (ended_at IS NOT NULL OR kind = 'PREVIEW');
DELETE FROM iam.host_session WHERE ended_at IS NOT NULL OR kind = 'PREVIEW';
DELETE FROM iam.oidc_transaction WHERE consumed_at IS NOT NULL;
DELETE FROM platform.operation_receipt WHERE account_id IS NULL;

DROP FUNCTION iam.account_access_scope(p_account_id uuid);
DROP FUNCTION iam.admit_application_owner(p_actor uuid, p_project_id uuid);
DROP FUNCTION iam.admit_project(p_account_id uuid, p_project_id uuid, p_action iam.action);
DROP FUNCTION iam.admit_workspace(p_account_id uuid, p_workspace_id uuid, p_action iam.action);
DROP FUNCTION iam.application_by_slug(p_slug text);
DROP FUNCTION iam.application_slug(p_project_id uuid);
DROP FUNCTION iam.application_slug_base(p_project_name text);
DROP FUNCTION iam.bootstrap_installation_administrator(p_account_id uuid);
DROP FUNCTION iam.cancel_application_invitation(p_actor uuid, p_project_id uuid, p_invitation_id uuid);
DROP FUNCTION iam.cancel_workspace_invitation(p_actor uuid, p_invitation_id uuid);
DROP FUNCTION iam.claim_application_invitations(p_account_id uuid, p_verified_email text);
DROP FUNCTION iam.claim_invitations(p_account_id uuid, p_verified_email text);
DROP FUNCTION iam.email_has_open_invitation(p_verified_email text);
DROP FUNCTION iam.end_host_session(p_session_digest bytea, p_reason text);
DROP FUNCTION iam.end_hub_session(p_session_digest bytea);
DROP FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone);
DROP FUNCTION iam.grant_first_installation_administrator(p_account_id uuid);
DROP FUNCTION iam.grant_installation_administrator(p_actor uuid, p_account_id uuid);
DROP FUNCTION iam.grant_installation_administrator_by_email(p_actor uuid, p_email text);
DROP FUNCTION iam.has_application_access(p_account_id uuid, p_project_id uuid);
DROP FUNCTION iam.hub_session_live(p_session_digest bytea, p_account_id uuid, p_now timestamp with time zone);
DROP FUNCTION iam.invite_workspace_member(p_actor uuid, p_workspace_id uuid, p_invitation_id uuid, p_email text, p_role iam.workspace_role, p_expires_at timestamp with time zone);
DROP FUNCTION iam.is_installation_administrator(p_account_id uuid);
DROP FUNCTION iam.list_application_access(p_actor uuid, p_project_id uuid);
DROP FUNCTION iam.list_installation_administrators(p_actor uuid);
DROP FUNCTION iam.list_workspace_roster(p_actor uuid, p_workspace_id uuid);
DROP FUNCTION iam.mint_application_handoff(p_account_id uuid, p_project_id uuid, p_handoff_digest bytea, p_binding_digest bytea, p_refresh_token text, p_authenticated_at timestamp with time zone);
DROP FUNCTION iam.open_hub_session(p_session_digest bytea, p_account_id uuid, p_refresh_token text, p_now timestamp with time zone);
DROP FUNCTION iam.open_preview(p_hub_session_digest bytea, p_account_id uuid, p_project_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_artifact_digest text, p_exact_host text, p_manifest jsonb, p_handoff_digest bytea, p_now timestamp with time zone);
DROP FUNCTION iam.provision_application_account(p_account_id uuid, p_issuer text, p_subject text, p_verified_email text, p_display_name text);
DROP FUNCTION iam.purge_project(p_project_id uuid);
DROP FUNCTION iam.reap_expired(p_now timestamp with time zone, p_limit integer);
DROP FUNCTION iam.record_provider_check(p_session_digest bytea, p_previous_checked_at timestamp with time zone, p_refresh_token text, p_now timestamp with time zone);
DROP FUNCTION iam.redeem_handoff(p_kind text, p_handoff_digest bytea, p_project_id uuid, p_exact_host text, p_binding_digest bytea, p_session_digest bytea, p_now timestamp with time zone);
DROP FUNCTION iam.remove_workspace_member(p_actor uuid, p_workspace_id uuid, p_member uuid);
DROP FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone);
DROP FUNCTION iam.resolve_hub_session(p_session_digest bytea, p_now timestamp with time zone);
DROP FUNCTION iam.resolve_preview_session(p_session_digest bytea, p_exact_host text, p_now timestamp with time zone);
DROP FUNCTION iam.revoke_application_grant(p_actor uuid, p_project_id uuid, p_grant_id uuid);
DROP FUNCTION iam.revoke_installation_administrator(p_actor uuid, p_account_id uuid);
DROP FUNCTION iam.role_allows(p_role iam.workspace_role, p_action iam.action);
DROP FUNCTION iam.session_lifetimes();
DROP FUNCTION iam.set_workspace_member_role(p_actor uuid, p_workspace_id uuid, p_member uuid, p_role iam.workspace_role);
DROP FUNCTION iam.visible_projects(p_account_id uuid);
DROP FUNCTION iam.visible_workspaces(p_account_id uuid);

ALTER TABLE iam.oidc_transaction DROP COLUMN consumed_at;

-- DROP COLUMN removes the checks, keys and partial indexes that name the column without a word, so
-- each one is dropped by name here and the ones the new shape keeps are added back below.
ALTER TABLE iam.host_session
  DROP CONSTRAINT host_session_hub_check,
  DROP CONSTRAINT host_session_application_check,
  DROP CONSTRAINT host_session_preview_check,
  DROP CONSTRAINT host_session_end_check,
  DROP CONSTRAINT host_session_reason_check,
  DROP CONSTRAINT host_session_preview_id_fkey,
  DROP CONSTRAINT host_session_project_id_fkey,
  DROP CONSTRAINT host_session_parent_digest_fkey;
DROP INDEX iam.host_session_open_application, iam.host_session_open_children;
ALTER TABLE iam.host_session
  DROP COLUMN ended_at,
  DROP COLUMN ended_reason,
  DROP COLUMN preview_id,
  ADD COLUMN artifact_revision_id uuid;

ALTER TABLE iam.handoff
  DROP CONSTRAINT handoff_application_check,
  DROP CONSTRAINT handoff_preview_check,
  DROP CONSTRAINT handoff_preview_id_fkey,
  DROP CONSTRAINT handoff_project_id_fkey,
  DROP CONSTRAINT handoff_parent_digest_fkey;
DROP INDEX iam.handoff_one_per_preview;
ALTER TABLE iam.handoff
  DROP COLUMN preview_id,
  ADD COLUMN artifact_revision_id uuid,
  ADD COLUMN session_expires_at timestamptz;

ALTER TABLE iam.host_session
  ADD CONSTRAINT host_session_token_account_key UNIQUE (token_digest, account_id),
  ADD CONSTRAINT host_session_project_id_fkey FOREIGN KEY (project_id) REFERENCES project.project(project_id),
  ADD CONSTRAINT host_session_parent_pair_fkey FOREIGN KEY (parent_digest, account_id) REFERENCES iam.host_session(token_digest, account_id) ON DELETE CASCADE,
  ADD CONSTRAINT host_session_hub_check CHECK (kind <> 'HUB' OR (idle_expires_at IS NOT NULL AND idle_expires_at <= absolute_expires_at AND absolute_expires_at > started_at AND provider_checked_at >= started_at AND provider_refresh_token IS NOT NULL AND project_id IS NULL AND artifact_revision_id IS NULL AND parent_digest IS NULL)),
  ADD CONSTRAINT host_session_application_check CHECK (kind <> 'APPLICATION' OR (project_id IS NOT NULL AND absolute_expires_at > started_at AND provider_checked_at >= started_at AND provider_refresh_token IS NOT NULL AND artifact_revision_id IS NULL AND parent_digest IS NULL AND idle_expires_at IS NULL)),
  ADD CONSTRAINT host_session_preview_check CHECK (kind <> 'PREVIEW' OR (project_id IS NOT NULL AND artifact_revision_id IS NOT NULL AND parent_digest IS NOT NULL AND absolute_expires_at > started_at AND provider_refresh_token IS NULL AND provider_checked_at IS NULL AND idle_expires_at IS NULL));
CREATE INDEX host_session_by_parent ON iam.host_session (parent_digest, account_id) WHERE parent_digest IS NOT NULL;
CREATE INDEX host_session_by_application_account ON iam.host_session (project_id, account_id) WHERE kind = 'APPLICATION';

ALTER TABLE iam.handoff
  ADD CONSTRAINT handoff_project_id_fkey FOREIGN KEY (project_id) REFERENCES project.project(project_id),
  ADD CONSTRAINT handoff_parent_pair_fkey FOREIGN KEY (parent_digest, account_id) REFERENCES iam.host_session(token_digest, account_id) ON DELETE CASCADE,
  ADD CONSTRAINT handoff_application_check CHECK (kind <> 'APPLICATION' OR (project_id IS NOT NULL AND binding_digest IS NOT NULL AND provider_refresh_token IS NOT NULL AND artifact_revision_id IS NULL AND parent_digest IS NULL AND session_expires_at IS NULL)),
  ADD CONSTRAINT handoff_preview_check CHECK (kind <> 'PREVIEW' OR (project_id IS NOT NULL AND artifact_revision_id IS NOT NULL AND parent_digest IS NOT NULL AND session_expires_at IS NOT NULL AND binding_digest IS NULL AND provider_refresh_token IS NULL));
CREATE INDEX handoff_by_parent ON iam.handoff (parent_digest, account_id) WHERE parent_digest IS NOT NULL;

ALTER TABLE iam.workspace_invitation ADD CONSTRAINT workspace_invitation_expiry_check CHECK (expires_at > created_at);

DROP TABLE iam.preview, iam.bootstrap_context, iam.operation_idempotency;
DROP TYPE iam.session_lifetime;
DROP TYPE iam.action;

ALTER TABLE platform.operation_receipt ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE platform.operation_receipt DROP CONSTRAINT operation_receipt_check;

DROP POLICY legacy_runtime ON iam.account;
DROP POLICY legacy_owner ON iam.account;
DROP POLICY legacy_owner ON iam.workspace_membership;
DROP POLICY legacy_owner ON project.project;
DROP POLICY legacy_owner ON project.project_deletion;

REASSIGN OWNED BY iam_owner, workspace_owner, project_owner, registry_owner, builder_owner, connector_owner, model_owner TO conexus_owner;
DROP OWNED BY iam_owner, workspace_owner, project_owner, registry_owner, builder_owner, connector_owner, model_owner, hub_iam_runtime;
-- Roles belong to the cluster and DROP OWNED acts on this database only. A second database of the
-- cluster that has not run this migration still depends on them, and a plain DROP ROLE would then
-- fail here and in that database alike. The last database to migrate drops them.
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['iam_owner', 'workspace_owner', 'project_owner', 'registry_owner', 'builder_owner', 'connector_owner', 'model_owner', 'hub_iam_runtime'] LOOP
    BEGIN
      EXECUTE format('DROP ROLE IF EXISTS %I', role_name);
    EXCEPTION WHEN dependent_objects_still_exist THEN NULL;
    END;
  END LOOP;
END $$;

REVOKE ALL ON iam.account, iam.workspace_membership, iam.oidc_transaction, iam.workspace_invitation, iam.installation_administrator,
  iam.application, iam.application_grant, iam.application_invitation, iam.host_session, iam.handoff
  FROM hub_runtime, hub_command, hub_reader;
REVOKE ALL ON FUNCTION iam.lock_administrators() FROM hub_runtime;
GRANT SELECT, INSERT, UPDATE (email, created_at) ON iam.account TO hub_command;
GRANT SELECT, INSERT, UPDATE (role, created_at), DELETE ON iam.workspace_membership TO hub_command;
GRANT SELECT, INSERT, UPDATE (role, invited_by, expires_at, created_at), DELETE ON iam.workspace_invitation TO hub_command;
GRANT SELECT, INSERT, UPDATE (revoked_at, revoked_by) ON iam.installation_administrator TO hub_command;
GRANT SELECT, INSERT, DELETE ON iam.application, iam.oidc_transaction, iam.handoff TO hub_command;
GRANT SELECT, INSERT, UPDATE (revoked_at, revoked_by), DELETE ON iam.application_grant TO hub_command;
GRANT SELECT, INSERT, UPDATE (invited_by, expires_at, created_at), DELETE ON iam.application_invitation TO hub_command;
GRANT SELECT, INSERT, UPDATE (idle_expires_at, provider_refresh_token, provider_checked_at), DELETE ON iam.host_session TO hub_command;
GRANT SELECT (account_id, display_name, email) ON iam.account TO hub_reader;
GRANT SELECT ON iam.workspace_membership, iam.workspace_invitation, iam.installation_administrator,
  iam.application, iam.application_grant, iam.application_invitation TO hub_reader;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['workspace_invitation', 'installation_administrator', 'application', 'application_grant', 'application_invitation', 'oidc_transaction', 'host_session', 'handoff'] LOOP
    EXECUTE format('ALTER TABLE iam.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE iam.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY command ON iam.%I TO hub_command USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

CREATE POLICY reader ON iam.workspace_invitation FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND workspace_id IN (SELECT rls.acting_workspaces()));
CREATE POLICY reader ON iam.installation_administrator FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND (SELECT rls.acting_installation_administrator()));
CREATE POLICY reader ON iam.application FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND project_id IN (SELECT p.project_id FROM project.project p WHERE p.workspace_id IN (SELECT m.workspace_id FROM iam.workspace_membership m WHERE m.account_id = (SELECT rls.acting_account()) AND m.role = 'owner')));
CREATE POLICY reader ON iam.application_grant FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND project_id IN (SELECT p.project_id FROM project.project p WHERE p.workspace_id IN (SELECT m.workspace_id FROM iam.workspace_membership m WHERE m.account_id = (SELECT rls.acting_account()) AND m.role = 'owner')));
CREATE POLICY reader ON iam.application_invitation FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND project_id IN (SELECT p.project_id FROM project.project p WHERE p.workspace_id IN (SELECT m.workspace_id FROM iam.workspace_membership m WHERE m.account_id = (SELECT rls.acting_account()) AND m.role = 'owner')));

DROP POLICY reader ON iam.account;
CREATE POLICY reader ON iam.account FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL AND (
    account_id = (SELECT rls.acting_account())
    OR account_id IN (SELECT member.account_id FROM iam.workspace_membership member)
    OR account_id IN (SELECT g.account_id FROM iam.application_grant g)
    OR (SELECT rls.acting_installation_administrator())));

-- Every owner's reader policy reads through rls.* helpers owned by iam_rls, and this is the one table
-- of the administrator branch it could not read once the legacy owner policy is gone.
CREATE POLICY iam_rls ON iam.installation_administrator FOR SELECT TO iam_rls USING (true);

COMMIT;
