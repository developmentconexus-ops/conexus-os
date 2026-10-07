BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM model.model_account) OR EXISTS (SELECT 1 FROM connector.connection) THEN
    RAISE EXCEPTION 'MODEL_ACCOUNT_RESET_REQUIRED: reset the local databases first, model accounts and connections hold values sealed without their row';
  END IF;
END $$;

DELETE FROM iam.handoff;
DELETE FROM iam.host_session;

DROP TABLE model.model_account_sharing_history;

DROP POLICY reader ON model.model_account;
DROP INDEX model.model_account_owner_provider_key, model.model_account_shared_provider_key;
ALTER TABLE model.model_account
  DROP CONSTRAINT model_account_sharing_check,
  DROP CONSTRAINT model_account_provider_check,
  DROP CONSTRAINT model_account_kind_check,
  DROP COLUMN sharing,
  DROP COLUMN created_at,
  ALTER COLUMN owner_account_id DROP NOT NULL,
  ADD COLUMN scope text NOT NULL,
  ADD COLUMN connected_by uuid NOT NULL,
  ADD COLUMN connected_by_name text NOT NULL,
  ADD COLUMN connected_at timestamp(3) with time zone NOT NULL,
  ADD COLUMN refused_at timestamp(3) with time zone,
  ADD CONSTRAINT model_account_scope_check CHECK (scope IN ('personal', 'installation')),
  ADD CONSTRAINT model_account_owner_check CHECK ((scope = 'personal') = (owner_account_id IS NOT NULL)),
  ADD CONSTRAINT model_account_pair_check CHECK ((provider, kind) IN (('anthropic', 'api_key'), ('anthropic', 'oauth'), ('openai-codex', 'oauth'), ('google-ai-pro', 'google_ai_pro'))),
  ADD CONSTRAINT model_account_refused_check CHECK (refused_at IS NULL OR refused_at >= connected_at);
CREATE UNIQUE INDEX model_account_personal_key ON model.model_account (owner_account_id, provider) WHERE scope = 'personal';
CREATE UNIQUE INDEX model_account_installation_key ON model.model_account (provider) WHERE scope = 'installation';

CREATE POLICY reader ON model.model_account FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL
    AND (scope = 'installation' OR owner_account_id = (SELECT rls.acting_account())));

REVOKE ALL ON model.model_account FROM hub_reader, hub_command;
GRANT SELECT (model_account_id, scope, owner_account_id, provider, kind, connected_by, connected_by_name, connected_at, updated_at, refused_at)
  ON model.model_account TO hub_reader;
GRANT SELECT, DELETE ON model.model_account TO hub_command;
GRANT INSERT (scope, owner_account_id, provider, kind, secret, connected_by, connected_by_name, connected_at) ON model.model_account TO hub_command;
GRANT UPDATE (kind, secret, connected_by, connected_by_name, connected_at, updated_at, refused_at) ON model.model_account TO hub_command;

ALTER TABLE model.installation_default
  DROP CONSTRAINT installation_default_role_check,
  ADD CONSTRAINT installation_default_role_check CHECK (role IN ('build', 'memory'));

COMMIT;
