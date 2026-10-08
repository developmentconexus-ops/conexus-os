BEGIN;

GRANT INSERT (scope, owner_account_id, provider, kind, secret, connected_by, connected_by_name, connected_at) ON model.model_account TO hub_runtime;
GRANT UPDATE (kind, secret, connected_by, connected_by_name, connected_at, updated_at, refused_at) ON model.model_account TO hub_runtime;

COMMIT;
