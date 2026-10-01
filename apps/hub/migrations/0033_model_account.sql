BEGIN;

-- A model account belongs to one person and is shared at one of two levels (spec 0002, Data
-- model). The unique index on (owner_account_id, provider) is "one account per person per
-- provider"; the partial unique index on provider where sharing = 'everyone' is "at most one
-- shared account per provider", the same limits the Factory enforced.
DO $$ BEGIN
  CREATE ROLE "hub_model_account" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE "model_owner" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SCHEMA model AUTHORIZATION model_owner;

GRANT USAGE ON SCHEMA model TO hub_model_account;

CREATE TABLE model.model_account (
    model_account_id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_account_id uuid NOT NULL,
    provider text NOT NULL,
    kind text NOT NULL,
    secret text NOT NULL,
    sharing text DEFAULT 'just_me'::text NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT model_account_pkey PRIMARY KEY (model_account_id),
    CONSTRAINT model_account_owner_account_id_fkey FOREIGN KEY (owner_account_id) REFERENCES iam.account(account_id) ON DELETE RESTRICT,
    CONSTRAINT model_account_provider_check CHECK ((provider ~ '^[a-z0-9][a-z0-9._-]{0,63}$'::text)),
    CONSTRAINT model_account_kind_check CHECK ((kind = ANY (ARRAY['api_key'::text, 'oauth'::text, 'google_ai_pro'::text]))),
    CONSTRAINT model_account_sharing_check CHECK ((sharing = ANY (ARRAY['just_me'::text, 'everyone'::text]))),
    -- Kept byte for byte from the Factory's envelope (Security model): only its code's home
    -- becomes Conexus's, and this is one of the checks that pin the prefix.
    CONSTRAINT model_account_secret_sealed_check CHECK ((secret LIKE 'mastra:factory-secret:v1:%'::text))
);

ALTER TABLE model.model_account OWNER TO model_owner;

REVOKE ALL ON TABLE model.model_account FROM PUBLIC;

CREATE UNIQUE INDEX model_account_owner_provider_key ON model.model_account USING btree (owner_account_id, provider);
CREATE UNIQUE INDEX model_account_shared_provider_key ON model.model_account USING btree (provider) WHERE (sharing = 'everyone'::text);

CREATE TABLE model.installation_default (
    role text NOT NULL,
    model_id text NOT NULL,
    updated_by uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT installation_default_pkey PRIMARY KEY (role),
    CONSTRAINT installation_default_role_check CHECK ((role = ANY (ARRAY['plan'::text, 'build'::text, 'memory'::text]))),
    CONSTRAINT installation_default_model_id_check CHECK ((length(btrim(model_id)) >= 1)),
    CONSTRAINT installation_default_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES iam.account(account_id)
);

ALTER TABLE model.installation_default OWNER TO model_owner;

REVOKE ALL ON TABLE model.installation_default FROM PUBLIC;

-- Writes the caller's own row for a provider, sealed by the caller (platform/secrets.ts). An
-- update keeps the row's sharing level unless the caller names a new one, so a refreshed
-- credential write never silently un-shares an administrator's account.
-- p_sharing is NULL, not 'just_me', when the caller does not name a level: a NULL default lets a
-- refresh write (which never names a level) fall through to the row's own current sharing, or to
-- 'just_me' the first time the row is created. A DEFAULT of 'just_me' would instead reset an
-- administrator's shared account to just_me on every refresh.
CREATE FUNCTION model.upsert_model_account(p_owner_account_id uuid, p_provider text, p_kind text, p_secret text, p_sharing text DEFAULT NULL) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE settled_id uuid; existing_sharing text;
BEGIN
  IF p_sharing IS NOT NULL AND p_sharing NOT IN ('just_me', 'everyone') THEN RAISE EXCEPTION 'MODEL_ACCOUNT_SHARING_REFUSED'; END IF;
  SELECT stored.sharing INTO existing_sharing FROM model.model_account AS stored
  WHERE stored.owner_account_id = p_owner_account_id AND stored.provider = p_provider;
  INSERT INTO model.model_account (owner_account_id, provider, kind, secret, sharing)
  VALUES (p_owner_account_id, p_provider, p_kind, p_secret, COALESCE(p_sharing, existing_sharing, 'just_me'))
  ON CONFLICT (owner_account_id, provider) DO UPDATE
    SET kind = EXCLUDED.kind, secret = EXCLUDED.secret, sharing = COALESCE(p_sharing, model.model_account.sharing), updated_at = clock_timestamp()
  RETURNING model_account_id INTO settled_id;
  RETURN settled_id;
END;
$$;

ALTER FUNCTION model.upsert_model_account(p_owner_account_id uuid, p_provider text, p_kind text, p_secret text, p_sharing text) OWNER TO model_owner;

REVOKE ALL ON FUNCTION model.upsert_model_account(p_owner_account_id uuid, p_provider text, p_kind text, p_secret text, p_sharing text) FROM PUBLIC;
GRANT ALL ON FUNCTION model.upsert_model_account(p_owner_account_id uuid, p_provider text, p_kind text, p_secret text, p_sharing text) TO hub_model_account;

-- The caller's own row for a provider, sealed. NULL means the caller has none of their own.
CREATE FUNCTION model.read_model_account(p_owner_account_id uuid, p_provider text) RETURNS TABLE(secret text, kind text, sharing text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT stored.secret, stored.kind, stored.sharing
  FROM model.model_account AS stored
  WHERE stored.owner_account_id = p_owner_account_id AND stored.provider = p_provider;
$$;

ALTER FUNCTION model.read_model_account(p_owner_account_id uuid, p_provider text) OWNER TO model_owner;

REVOKE ALL ON FUNCTION model.read_model_account(p_owner_account_id uuid, p_provider text) FROM PUBLIC;
GRANT ALL ON FUNCTION model.read_model_account(p_owner_account_id uuid, p_provider text) TO hub_model_account;

-- The row the installation shares for a provider, sealed. NULL means nobody has shared one.
CREATE FUNCTION model.read_shared_model_account(p_provider text) RETURNS TABLE(secret text, kind text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT stored.secret, stored.kind
  FROM model.model_account AS stored
  WHERE stored.provider = p_provider AND stored.sharing = 'everyone';
$$;

ALTER FUNCTION model.read_shared_model_account(p_provider text) OWNER TO model_owner;

REVOKE ALL ON FUNCTION model.read_shared_model_account(p_provider text) FROM PUBLIC;
GRANT ALL ON FUNCTION model.read_shared_model_account(p_provider text) TO hub_model_account;

COMMIT;
