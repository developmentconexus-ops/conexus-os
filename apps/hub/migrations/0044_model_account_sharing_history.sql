BEGIN;

-- Every change of a model account's sharing level (just_me <-> everyone) is recorded here as an
-- append-only row: the account, the old value, the new value, who changed it, and when. Only
-- model.upsert_model_account writes this table (issue: record who shares a model account with
-- everyone) and no Hub role reaches it directly, the same convention model_account itself holds.
-- previous_sharing is NULL for the one event with no prior row to change from: an account created
-- directly with sharing='everyone'. That is still someone sharing a model account with everyone,
-- and the issue asks to record it, so it is not skipped just because there was no earlier value.
CREATE TABLE model.model_account_sharing_history (
    history_id uuid DEFAULT gen_random_uuid() NOT NULL,
    model_account_id uuid NOT NULL,
    previous_sharing text,
    new_sharing text NOT NULL,
    changed_by_account_id uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT model_account_sharing_history_pkey PRIMARY KEY (history_id),
    CONSTRAINT model_account_sharing_history_model_account_id_fkey FOREIGN KEY (model_account_id) REFERENCES model.model_account(model_account_id) ON DELETE RESTRICT,
    CONSTRAINT model_account_sharing_history_changed_by_account_id_fkey FOREIGN KEY (changed_by_account_id) REFERENCES iam.account(account_id) ON DELETE RESTRICT,
    CONSTRAINT model_account_sharing_history_previous_sharing_check CHECK ((previous_sharing IS NULL) OR (previous_sharing = ANY (ARRAY['just_me'::text, 'everyone'::text]))),
    CONSTRAINT model_account_sharing_history_new_sharing_check CHECK ((new_sharing = ANY (ARRAY['just_me'::text, 'everyone'::text])))
);

ALTER TABLE model.model_account_sharing_history OWNER TO model_owner;

REVOKE ALL ON TABLE model.model_account_sharing_history FROM PUBLIC;

CREATE INDEX model_account_sharing_history_account_changed_at_idx ON model.model_account_sharing_history USING btree (model_account_id, changed_at);

-- Replaces model.upsert_model_account (0033) to add an actor and record sharing changes. The
-- actor defaults to the owner because every call site today is self-service; a future
-- administrator-on-behalf-of route can pass a distinct actor without another migration.
DROP FUNCTION model.upsert_model_account(p_owner_account_id uuid, p_provider text, p_kind text, p_secret text, p_sharing text);

CREATE FUNCTION model.upsert_model_account(p_owner_account_id uuid, p_provider text, p_kind text, p_secret text, p_sharing text DEFAULT NULL, p_actor_account_id uuid DEFAULT NULL) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE settled_id uuid; existing_sharing text; settled_actor uuid;
BEGIN
  IF p_sharing IS NOT NULL AND p_sharing NOT IN ('just_me', 'everyone') THEN RAISE EXCEPTION 'MODEL_ACCOUNT_SHARING_REFUSED'; END IF;
  settled_actor := COALESCE(p_actor_account_id, p_owner_account_id);
  -- FOR UPDATE locks the row (if one already exists) for the rest of this transaction, so a
  -- concurrent call for the same owner/provider blocks here instead of reading the same
  -- pre-change sharing value and racing this one to the history insert below. model_account.sharing
  -- is NOT NULL, so existing_sharing is NULL exactly when no row was found.
  SELECT stored.sharing INTO existing_sharing FROM model.model_account AS stored
  WHERE stored.owner_account_id = p_owner_account_id AND stored.provider = p_provider
  FOR UPDATE;
  INSERT INTO model.model_account (owner_account_id, provider, kind, secret, sharing)
  VALUES (p_owner_account_id, p_provider, p_kind, p_secret, COALESCE(p_sharing, existing_sharing, 'just_me'))
  ON CONFLICT (owner_account_id, provider) DO UPDATE
    SET kind = EXCLUDED.kind, secret = EXCLUDED.secret, sharing = COALESCE(p_sharing, model.model_account.sharing), updated_at = clock_timestamp()
  RETURNING model_account_id INTO settled_id;
  -- A change to record is either an existing row's sharing actually moving, or a brand-new row
  -- created directly as 'everyone': both are someone sharing a model account with everyone (or
  -- withdrawing it), which is what the audit trail exists to answer. A new row left at the
  -- default 'just_me' is not a decision anyone made, so it is not logged.
  IF p_sharing IS NOT NULL AND p_sharing IS DISTINCT FROM existing_sharing AND (existing_sharing IS NOT NULL OR p_sharing = 'everyone') THEN
    INSERT INTO model.model_account_sharing_history (model_account_id, previous_sharing, new_sharing, changed_by_account_id)
    VALUES (settled_id, existing_sharing, p_sharing, settled_actor);
  END IF;
  RETURN settled_id;
END;
$$;

ALTER FUNCTION model.upsert_model_account(p_owner_account_id uuid, p_provider text, p_kind text, p_secret text, p_sharing text, p_actor_account_id uuid) OWNER TO model_owner;

REVOKE ALL ON FUNCTION model.upsert_model_account(p_owner_account_id uuid, p_provider text, p_kind text, p_secret text, p_sharing text, p_actor_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION model.upsert_model_account(p_owner_account_id uuid, p_provider text, p_kind text, p_secret text, p_sharing text, p_actor_account_id uuid) TO hub_model_account;

COMMIT;
