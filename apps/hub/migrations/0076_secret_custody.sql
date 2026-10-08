BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM model.model_account) OR EXISTS (SELECT 1 FROM connector.connection) THEN
    RAISE EXCEPTION 'SECRET_CUSTODY_RESET_REQUIRED: model accounts and connections must be empty before the row-bound cutover';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND
    (conrelid, conname, pg_get_constraintdef(oid)) IN (
      ('connector.connection'::regclass, 'connection_credential_sealed_check', 'CHECK ((credential_sealed ~~ ''mastra:factory-secret:v1:%''::text))'),
      ('iam.handoff'::regclass, 'handoff_token_sealed_check', 'CHECK (((provider_refresh_token IS NULL) OR (provider_refresh_token ~~ ''mastra:factory-secret:v1:%''::text)))'),
      ('iam.host_session'::regclass, 'host_session_token_sealed_check', 'CHECK (((provider_refresh_token IS NULL) OR (provider_refresh_token ~~ ''mastra:factory-secret:v1:%''::text)))'),
      ('model.model_account'::regclass, 'model_account_secret_sealed_check', 'CHECK ((secret ~~ ''mastra:factory-secret:v1:%''::text))'))) <> 4 THEN
    RAISE EXCEPTION 'SECRET_CUSTODY_CHECK_SET_REFUSED';
  END IF;
END $$;

DELETE FROM iam.handoff;
DELETE FROM iam.host_session;

ALTER TABLE connector.connection DROP CONSTRAINT connection_credential_sealed_check,
  ADD CONSTRAINT connection_credential_sealed_check CHECK (credential_sealed LIKE 'conexus:secret:v1:%');
ALTER TABLE iam.handoff DROP CONSTRAINT handoff_token_sealed_check,
  ADD CONSTRAINT handoff_token_sealed_check CHECK (provider_refresh_token IS NULL OR provider_refresh_token LIKE 'conexus:secret:v1:%');
ALTER TABLE iam.host_session DROP CONSTRAINT host_session_token_sealed_check,
  ADD CONSTRAINT host_session_token_sealed_check CHECK (provider_refresh_token IS NULL OR provider_refresh_token LIKE 'conexus:secret:v1:%');
ALTER TABLE model.model_account DROP CONSTRAINT model_account_secret_sealed_check,
  ADD CONSTRAINT model_account_secret_sealed_check CHECK (secret LIKE 'conexus:secret:v1:%');

-- Row identity is chosen before sealing, rather than by the INSERT's default after sealing.
GRANT INSERT (model_account_id) ON model.model_account TO hub_runtime;

COMMIT;
