BEGIN;

DO $$ BEGIN
  CREATE ROLE iam_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_iam_runtime LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SCHEMA IF NOT EXISTS iam AUTHORIZATION iam_owner;
REVOKE ALL ON SCHEMA iam FROM PUBLIC;
GRANT USAGE ON SCHEMA iam TO hub_iam_runtime;

SET LOCAL ROLE iam_owner;

CREATE TABLE IF NOT EXISTS iam.schema_migration (
  version text PRIMARY KEY,
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS iam.account (
  account_id uuid PRIMARY KEY,
  issuer text NOT NULL CHECK (issuer <> ''),
  external_subject text NOT NULL CHECK (external_subject <> ''),
  display_name text NOT NULL CHECK (display_name ~ '\S'),
  email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (issuer, external_subject)
);

CREATE TABLE IF NOT EXISTS iam.oidc_transaction (
  state_digest bytea PRIMARY KEY,
  pkce_verifier text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE TABLE IF NOT EXISTS iam.bootstrap_context (
  token_digest bytea PRIMARY KEY,
  issuer text NOT NULL,
  external_subject text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  UNIQUE (issuer, external_subject)
);

CREATE TABLE IF NOT EXISTS iam.session (
  token_digest bytea PRIMARY KEY,
  csrf_digest bytea NOT NULL,
  account_id uuid NOT NULL REFERENCES iam.account(account_id),
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS iam.operation_idempotency (
  operation_id text NOT NULL CHECK (operation_id = 'IAM-03'),
  authority_scope text NOT NULL,
  key_digest bytea NOT NULL,
  request_digest bytea NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('RESERVED', 'SUCCEEDED')),
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (operation_id, authority_scope, key_digest)
);

REVOKE ALL ON ALL TABLES IN SCHEMA iam FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON iam.account, iam.oidc_transaction,
  iam.bootstrap_context, iam.session, iam.operation_idempotency
  TO hub_iam_runtime;
GRANT SELECT ON iam.schema_migration TO hub_iam_runtime;

RESET ROLE;
COMMIT;
