BEGIN;

DROP FUNCTION model.read_installation_default(text);
DROP FUNCTION model.read_model_account(uuid, text);
DROP FUNCTION model.read_shared_model_account(text);
DROP FUNCTION model.read_model_account_by_id(uuid);
DROP FUNCTION model.rewrite_model_account_secret(uuid, text);
DROP FUNCTION model.upsert_model_account(uuid, text, text, text, text, uuid);

ALTER TABLE model.model_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE model.model_account FORCE ROW LEVEL SECURITY;
ALTER TABLE model.model_account_sharing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE model.model_account_sharing_history FORCE ROW LEVEL SECURITY;
ALTER TABLE model.installation_default ENABLE ROW LEVEL SECURITY;
ALTER TABLE model.installation_default FORCE ROW LEVEL SECURITY;

CREATE POLICY command ON model.model_account TO hub_command USING (true) WITH CHECK (true);
CREATE POLICY command ON model.model_account_sharing_history TO hub_command USING (true) WITH CHECK (true);
CREATE POLICY command ON model.installation_default TO hub_command USING (true) WITH CHECK (true);

-- A person reads the rows they own and the one a provider shares with everyone. The sharing history has no reader policy: no route lists it.
CREATE POLICY reader ON model.model_account FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL
    AND (owner_account_id = (SELECT rls.acting_account()) OR sharing = 'everyone'));
CREATE POLICY reader ON model.installation_default FOR SELECT TO hub_reader
  USING ((SELECT rls.acting_account()) IS NOT NULL);

-- The reader never holds the sealed secret column; a run reads it on the command role under its proof.
GRANT SELECT (created_at, kind, model_account_id, owner_account_id, provider, sharing, updated_at)
  ON model.model_account TO hub_reader;
GRANT SELECT ON model.installation_default TO hub_reader;
GRANT SELECT ON model.model_account TO hub_command;
GRANT INSERT (kind, owner_account_id, provider, secret) ON model.model_account TO hub_command;
GRANT UPDATE (kind, secret, updated_at) ON model.model_account TO hub_command;

DROP OWNED BY hub_model_account;
DROP ROLE hub_model_account;

COMMIT;
