import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const repositoryRoot = resolve(import.meta.dirname, '..')
const defaultMigrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
const migrationPattern = /^(\d{3})_[a-z0-9_]+\.sql$/
const expectedMigrationNames = [
  '001_iam_foundation.sql',
  '002_workspace_foundation.sql',
  '003_project_foundation.sql',
  '004_project_source_recovery.sql',
  '005_project_source_recovery_scan.sql',
  '006_project_create_authorization.sql',
  '007_project_read_disclosure.sql',
  '008_project_baseline_custody.sql',
  '009_project_inception.sql',
  '010_project_inception_refinement.sql',
]
const migration001Digest = 'd27e76b972145bc3a6bf669d4fd32734fc06153d07cddaf1072c6b29845b112f'
const migration002Digest = 'b64a8e041a8e63ac3b85559805ac5573a1d53f6d5d95ba1421ffe3f9803804b5'
const migration003Digest = '866c6da3d1a4171437b2c0a5beb72ff4994cfce499826cd8b397c2daa60037f2'
const migration004Digest = 'c7477d9ac1786ebe330221641a916df102b8af553d18fb8b3c302b519b13f313'
const migration005Digest = '8eac8987356002c4a22ee96d169c5a33622d0116d7b5b8190af5f412f6db2bd5'
const migration006Digest = 'e8db0346c822bc38543d3e18d71862c4be186165709fc032ed1b110260ef32d4'
const migration007Digest = 'd68caa47710295c28bcdf82ca102d8318779ae0033a9c62debd7f22d72a68975'
const migration008Digest = '066ce45f5df4be134792c575e9339729a5532efa540cd4bf8fa6e776c651add0'
const migration009Digest = '86f5d88587d90fc26387a8b36002e0797bf340cea7d45ac3d910210ae615538a'
const migration010Digest = '31755edeac0509d32620d4307ea8227f58d59e5b2fcd1b89b6b0884cee450ba2'
const advisoryLock = 4_349_395_539_450_322_946n
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }
export const loadMigrationFiles = (migrationsRoot = defaultMigrationsRoot) => {
  const files = readdirSync(migrationsRoot).filter((name) => name.endsWith('.sql')).sort()
  if (JSON.stringify(files) !== JSON.stringify(expectedMigrationNames)) fail('MIGRATION_CENSUS_REFUSED')
  const migrations = files.map((name) => {
    const match = migrationPattern.exec(name)
    if (!match) fail('MIGRATION_NAME_REFUSED', name)
    const path = resolve(migrationsRoot, name)
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) fail('MIGRATION_ENTRY_REFUSED', name)
    const bytes = readFileSync(path)
    return { version: match[1], name, path, bytes, checksum: sha256(bytes) }
  })
  if (migrations.length === 0 || new Set(migrations.map(({ version }) => version)).size !== migrations.length) fail('MIGRATION_CENSUS_REFUSED')
  if (migrations.map(({ version }) => version).join(',') !== migrations.map(({ version }) => version).sort().join(',')) fail('MIGRATION_ORDER_REFUSED')
  if (migrations[0].version !== '001' || migrations[0].checksum !== migration001Digest) fail('MIGRATION_001_DIGEST_REFUSED')
  if (migrations[1].version !== '002' || migrations[1].checksum !== migration002Digest) fail('MIGRATION_002_DIGEST_REFUSED')
  if (migrations[2].version !== '003' || migrations[2].checksum !== migration003Digest) fail('MIGRATION_003_DIGEST_REFUSED')
  if (migrations[3].version !== '004' || migrations[3].checksum !== migration004Digest) fail('MIGRATION_004_DIGEST_REFUSED')
  if (migrations[4].version !== '005' || migrations[4].checksum !== migration005Digest) fail('MIGRATION_005_DIGEST_REFUSED')
  if (migrations[5].version !== '006' || migrations[5].checksum !== migration006Digest) fail('MIGRATION_006_DIGEST_REFUSED')
  if (migrations[6].version !== '007' || migrations[6].checksum !== migration007Digest) fail('MIGRATION_007_DIGEST_REFUSED')
  if (migrations[7].version !== '008' || migrations[7].checksum !== migration008Digest) fail('MIGRATION_008_DIGEST_REFUSED')
  if (migrations[8].version !== '009' || migrations[8].checksum !== migration009Digest) fail('MIGRATION_009_DIGEST_REFUSED')
  if (migrations[9].version !== '010' || migrations[9].checksum !== migration010Digest) fail('MIGRATION_010_DIGEST_REFUSED')
  return migrations
}

const migrationBody = ({ name, bytes }) => {
  const source = bytes.toString('utf8')
  const match = /^BEGIN;\r?\n([\s\S]*)\r?\nCOMMIT;\r?\n?$/.exec(source)
  if (!match) fail('MIGRATION_TRANSACTION_ENVELOPE_REFUSED', name)
  return match[1]
}

const tableExists = async (client, qualified) => (await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [qualified])).rows[0].present
const schemaExists = async (client, schema) => (await client.query('SELECT to_regnamespace($1) IS NOT NULL AS present', [schema])).rows[0].present

const assertSignatures = async (client, code, statement, expected) => {
  const actual = (await client.query(statement)).rows.map(({ signature }) => signature)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code)
}
const assertRowsDigest = async (client, code, statement, expectedDigest) => {
  const rows = (await client.query(statement)).rows
  if (sha256(JSON.stringify(rows)) !== expectedDigest) fail(code)
}

const iam001Columns = [
  'account:account_id:uuid:NO', 'account:issuer:text:NO', 'account:external_subject:text:NO', 'account:display_name:text:NO',
  'account:email:text:YES', 'account:active:bool:NO', 'account:created_at:timestamptz:NO',
  'bootstrap_context:token_digest:bytea:NO', 'bootstrap_context:issuer:text:NO', 'bootstrap_context:external_subject:text:NO',
  'bootstrap_context:expires_at:timestamptz:NO', 'bootstrap_context:consumed_at:timestamptz:YES',
  'oidc_transaction:state_digest:bytea:NO', 'oidc_transaction:pkce_verifier:text:NO', 'oidc_transaction:nonce:text:NO',
  'oidc_transaction:expires_at:timestamptz:NO', 'oidc_transaction:consumed_at:timestamptz:YES',
  'operation_idempotency:operation_id:text:NO', 'operation_idempotency:authority_scope:text:NO',
  'operation_idempotency:key_digest:bytea:NO', 'operation_idempotency:request_digest:bytea:NO',
  'operation_idempotency:outcome:text:NO', 'operation_idempotency:response_status:int4:YES',
  'operation_idempotency:response_body:jsonb:YES', 'operation_idempotency:created_at:timestamptz:NO',
  'operation_idempotency:completed_at:timestamptz:YES',
  'schema_migration:version:text:NO', 'schema_migration:checksum_sha256:text:NO', 'schema_migration:applied_at:timestamptz:NO',
  'session:token_digest:bytea:NO', 'session:csrf_digest:bytea:NO', 'session:account_id:uuid:NO',
  'session:created_at:timestamptz:NO', 'session:last_seen_at:timestamptz:NO', 'session:idle_expires_at:timestamptz:NO',
  'session:absolute_expires_at:timestamptz:NO', 'session:revoked_at:timestamptz:YES',
]
const iam001Constraints = [
  'account:account_display_name_check:c:', 'account:account_external_subject_check:c:', 'account:account_issuer_check:c:',
  'account:account_issuer_external_subject_key:u:', 'account:account_pkey:p:',
  'bootstrap_context:bootstrap_context_issuer_external_subject_key:u:', 'bootstrap_context:bootstrap_context_pkey:p:',
  'oidc_transaction:oidc_transaction_pkey:p:',
  'operation_idempotency:operation_idempotency_operation_id_check:c:', 'operation_idempotency:operation_idempotency_outcome_check:c:',
  'operation_idempotency:operation_idempotency_pkey:p:',
  'schema_migration:schema_migration_checksum_sha256_check:c:', 'schema_migration:schema_migration_pkey:p:',
  'session:session_account_id_fkey:f:FOREIGN KEY (account_id) REFERENCES iam.account(account_id)', 'session:session_pkey:p:',
]
const iam001RuntimePrivileges = [
  'account:INSERT', 'account:SELECT', 'account:UPDATE',
  'bootstrap_context:INSERT', 'bootstrap_context:SELECT', 'bootstrap_context:UPDATE',
  'oidc_transaction:INSERT', 'oidc_transaction:SELECT', 'oidc_transaction:UPDATE',
  'operation_idempotency:INSERT', 'operation_idempotency:SELECT', 'operation_idempotency:UPDATE',
  'schema_migration:SELECT',
  'session:INSERT', 'session:SELECT', 'session:UPDATE',
]

const assert001Catalog = async (client, { withS2 = false } = {}) => {
  await assertSignatures(client, 'MIGRATION_001_CATALOG_REFUSED', `
    SELECT rolname || ':' || rolcanlogin || ':' || rolsuper || ':' || rolinherit || ':' || rolcreaterole || ':' ||
      rolcreatedb || ':' || rolreplication || ':' || rolbypassrls AS signature
    FROM pg_roles WHERE rolname IN ('hub_iam_runtime', 'iam_owner') ORDER BY rolname
  `, ['hub_iam_runtime:true:false:false:false:false:false:false', 'iam_owner:false:false:false:false:false:false:false'])
  await assertSignatures(client, 'MIGRATION_001_CATALOG_REFUSED', `
    SELECT nspname || ':' || pg_get_userbyid(nspowner) AS signature
    FROM pg_namespace WHERE nspname = 'iam'
  `, ['iam:iam_owner'])
  const relations = [
    'iam.account:r:iam_owner', 'iam.bootstrap_context:r:iam_owner', 'iam.oidc_transaction:r:iam_owner',
    'iam.operation_idempotency:r:iam_owner', 'iam.schema_migration:r:iam_owner', 'iam.session:r:iam_owner',
    ...(withS2 ? [
      'iam.workspace_membership:r:iam_owner',
      'workspace.operation_idempotency:r:workspace_owner',
      'workspace.workspace:r:workspace_owner',
    ] : []),
  ]
  await assertSignatures(client, 'MIGRATION_001_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || c.relname || ':' || c.relkind::text || ':' || pg_get_userbyid(c.relowner) AS signature
    FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('iam', 'workspace') AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      AND c.relname IN ('account', 'bootstrap_context', 'oidc_transaction', 'operation_idempotency',
        'schema_migration', 'session', 'workspace_membership', 'workspace')
    ORDER BY n.nspname, c.relname
  `, relations)
  await assertSignatures(client, 'MIGRATION_001_CATALOG_REFUSED', `
    SELECT table_name || ':' || column_name || ':' || udt_name || ':' || is_nullable AS signature
    FROM information_schema.columns
    WHERE table_schema = 'iam' AND table_name IN ('account', 'bootstrap_context', 'oidc_transaction', 'operation_idempotency', 'schema_migration', 'session')
    ORDER BY table_name, ordinal_position
  `, iam001Columns)
  await assertRowsDigest(client, 'MIGRATION_001_CATALOG_REFUSED', `
    SELECT table_name, column_name, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'iam' AND table_name IN ('account', 'bootstrap_context', 'oidc_transaction', 'operation_idempotency', 'schema_migration', 'session')
    ORDER BY table_name, ordinal_position
  `, '718cfef30e35fb34ba65fffe44dc226d13475c4799ccd40113d6daa01c1d1788')
  await assertSignatures(client, 'MIGRATION_001_CATALOG_REFUSED', `
    SELECT c.relname || ':' || constraint_row.conname || ':' || constraint_row.contype::text || ':' ||
      CASE WHEN constraint_row.contype = 'f' THEN pg_get_constraintdef(constraint_row.oid, true) ELSE '' END AS signature
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS c ON c.oid = constraint_row.conrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'iam' AND c.relname IN ('account', 'bootstrap_context', 'oidc_transaction', 'operation_idempotency', 'schema_migration', 'session')
    ORDER BY c.relname, constraint_row.conname
  `, iam001Constraints)
  await assertRowsDigest(client, 'MIGRATION_001_CATALOG_REFUSED', `
    SELECT c.relname AS table_name, constraint_row.conname, constraint_row.contype,
      pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS c ON c.oid = constraint_row.conrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'iam' AND c.relname IN ('account', 'bootstrap_context', 'oidc_transaction', 'operation_idempotency', 'schema_migration', 'session')
    ORDER BY c.relname, constraint_row.conname
  `, '59885c5bd7c675b1d3e016e47ac85516c302f65a22fa61921e06e939bb325021')
  const indexes = [
    'iam.account:account_issuer_external_subject_key', 'iam.account:account_pkey',
    'iam.bootstrap_context:bootstrap_context_issuer_external_subject_key', 'iam.bootstrap_context:bootstrap_context_pkey',
    'iam.oidc_transaction:oidc_transaction_pkey', 'iam.operation_idempotency:operation_idempotency_pkey',
    'iam.schema_migration:schema_migration_pkey', 'iam.session:session_pkey',
    ...(withS2 ? [
      'iam.workspace_membership:workspace_membership_pkey',
      'workspace.operation_idempotency:operation_idempotency_pkey',
      'workspace.workspace:workspace_pkey',
    ] : []),
  ]
  await assertSignatures(client, 'MIGRATION_001_CATALOG_REFUSED', `
    SELECT schemaname || '.' || tablename || ':' || indexname AS signature
    FROM pg_indexes WHERE schemaname IN ('iam', 'workspace')
      AND tablename IN ('account', 'bootstrap_context', 'oidc_transaction', 'operation_idempotency',
        'schema_migration', 'session', 'workspace_membership', 'workspace')
    ORDER BY schemaname, tablename, indexname
  `, indexes)
  await assertSignatures(client, 'MIGRATION_001_CATALOG_REFUSED', `
    SELECT table_name || ':' || privilege_type AS signature
    FROM information_schema.table_privileges
    WHERE table_schema = 'iam' AND grantee = 'hub_iam_runtime'
    ORDER BY table_name, privilege_type
  `, iam001RuntimePrivileges)
  const boundary = (await client.query(`
    SELECT has_schema_privilege('hub_iam_runtime', 'iam', 'USAGE') AS runtime_usage,
      has_schema_privilege('hub_iam_runtime', 'iam', 'CREATE') AS runtime_create,
      has_schema_privilege('public', 'iam', 'USAGE') AS public_usage,
      pg_has_role('hub_iam_runtime', 'iam_owner', 'MEMBER') AS owner_member
  `)).rows[0]
  if (JSON.stringify(boundary) !== JSON.stringify({ runtime_usage: true, runtime_create: false, public_usage: false, owner_member: false })) {
    fail('MIGRATION_001_CATALOG_REFUSED')
  }
}

const s2Columns = [
  'iam.workspace_membership:account_id:uuid:NO', 'iam.workspace_membership:workspace_id:uuid:NO',
  'iam.workspace_membership:can_create_project:bool:NO', 'iam.workspace_membership:created_at:timestamptz:NO',
  'workspace.operation_idempotency:operation_id:text:NO', 'workspace.operation_idempotency:account_id:uuid:NO',
  'workspace.operation_idempotency:key_digest:text:NO', 'workspace.operation_idempotency:request_digest:text:NO',
  'workspace.operation_idempotency:reserved_workspace_id:uuid:NO', 'workspace.operation_idempotency:outcome:text:NO',
  'workspace.operation_idempotency:response_status:int4:YES', 'workspace.operation_idempotency:response_digest:text:YES',
  'workspace.operation_idempotency:response_body:jsonb:YES', 'workspace.operation_idempotency:created_at:timestamptz:NO',
  'workspace.operation_idempotency:completed_at:timestamptz:YES',
  'workspace.workspace:workspace_id:uuid:NO', 'workspace.workspace:name:text:NO', 'workspace.workspace:created_at:timestamptz:NO',
]
const s2Constraints = [
  'iam.workspace_membership:workspace_membership_account_id_fkey:f:FOREIGN KEY (account_id) REFERENCES iam.account(account_id)',
  'iam.workspace_membership:workspace_membership_pkey:p:',
  'iam.workspace_membership:workspace_membership_workspace_id_fkey:f:FOREIGN KEY (workspace_id) REFERENCES workspace.workspace(workspace_id) ON DELETE RESTRICT',
  'workspace.operation_idempotency:operation_idempotency_check:c:',
  'workspace.operation_idempotency:operation_idempotency_key_digest_check:c:',
  'workspace.operation_idempotency:operation_idempotency_operation_id_check:c:',
  'workspace.operation_idempotency:operation_idempotency_outcome_check:c:',
  'workspace.operation_idempotency:operation_idempotency_pkey:p:',
  'workspace.operation_idempotency:operation_idempotency_request_digest_check:c:',
  'workspace.operation_idempotency:operation_idempotency_response_digest_check:c:',
  'workspace.workspace:workspace_name_check:c:', 'workspace.workspace:workspace_pkey:p:',
]
const s2Functions = [
  'iam.establish_workspace_creator_access(uuid, uuid):iam_owner:true:search_path=pg_catalog, pg_temp:void',
  'iam.list_workspace_memberships(uuid):iam_owner:true:search_path=pg_catalog, pg_temp:TABLE(workspace_id uuid)',
  'workspace.complete_create_workspace_receipt(uuid, text, integer, text, jsonb):workspace_owner:true:search_path=pg_catalog, pg_temp:void',
  'workspace.create_workspace(uuid, text):workspace_owner:true:search_path=pg_catalog, pg_temp:void',
  'workspace.list_workspace_summaries(uuid[]):workspace_owner:true:search_path=pg_catalog, pg_temp:TABLE(workspace_id uuid, name text)',
  'workspace.reserve_or_replay_create_workspace(uuid, text, text, uuid):workspace_owner:true:search_path=pg_catalog, pg_temp:TABLE(state text, workspace_id uuid, response_status integer, response_body jsonb)',
]
const s2Execute = [
  'hub_s2_read:iam.list_workspace_memberships(uuid)', 'hub_s2_read:workspace.list_workspace_summaries(uuid[])',
  'hub_ws01_command:iam.establish_workspace_creator_access(uuid, uuid)',
  'hub_ws01_command:workspace.complete_create_workspace_receipt(uuid, text, integer, text, jsonb)',
  'hub_ws01_command:workspace.create_workspace(uuid, text)',
  'hub_ws01_command:workspace.reserve_or_replay_create_workspace(uuid, text, text, uuid)',
]

const assert002Catalog = async (client) => {
  await assert001Catalog(client, { withS2: true })
  await assertSignatures(client, 'MIGRATION_002_CATALOG_REFUSED', `
    SELECT rolname || ':' || rolcanlogin || ':' || rolsuper || ':' || rolinherit || ':' || rolcreaterole || ':' ||
      rolcreatedb || ':' || rolreplication || ':' || rolbypassrls AS signature
    FROM pg_roles WHERE rolname IN ('hub_s2_read', 'hub_ws01_command', 'workspace_owner') ORDER BY rolname
  `, [
    'hub_s2_read:true:false:false:false:false:false:false',
    'hub_ws01_command:true:false:false:false:false:false:false',
    'workspace_owner:false:false:false:false:false:false:false',
  ])
  await assertSignatures(client, 'MIGRATION_002_CATALOG_REFUSED', `
    SELECT nspname || ':' || pg_get_userbyid(nspowner) AS signature
    FROM pg_namespace WHERE nspname = 'workspace'
  `, ['workspace:workspace_owner'])
  await assertSignatures(client, 'MIGRATION_002_CATALOG_REFUSED', `
    SELECT table_schema || '.' || table_name || ':' || column_name || ':' || udt_name || ':' || is_nullable AS signature
    FROM information_schema.columns
    WHERE (table_schema, table_name) IN (('iam', 'workspace_membership'), ('workspace', 'operation_idempotency'), ('workspace', 'workspace'))
    ORDER BY table_schema, table_name, ordinal_position
  `, s2Columns)
  await assertRowsDigest(client, 'MIGRATION_002_CATALOG_REFUSED', `
    SELECT table_schema, table_name, column_name, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE (table_schema, table_name) IN (('iam', 'workspace_membership'), ('workspace', 'operation_idempotency'), ('workspace', 'workspace'))
    ORDER BY table_schema, table_name, ordinal_position
  `, 'ea416e47151dc90aa452ced5cee5b7b8a75dd643e81d070688ea22b3e8e6fcf9')
  await assertSignatures(client, 'MIGRATION_002_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || c.relname || ':' || constraint_row.conname || ':' || constraint_row.contype::text || ':' ||
      CASE WHEN constraint_row.contype = 'f' THEN pg_get_constraintdef(constraint_row.oid, true) ELSE '' END AS signature
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS c ON c.oid = constraint_row.conrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE (n.nspname, c.relname) IN (('iam', 'workspace_membership'), ('workspace', 'operation_idempotency'), ('workspace', 'workspace'))
    ORDER BY n.nspname, c.relname, constraint_row.conname
  `, s2Constraints)
  await assertRowsDigest(client, 'MIGRATION_002_CATALOG_REFUSED', `
    SELECT n.nspname AS schema, c.relname AS table_name, constraint_row.conname, constraint_row.contype,
      pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS c ON c.oid = constraint_row.conrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE (n.nspname, c.relname) IN (('iam', 'workspace_membership'), ('workspace', 'operation_idempotency'), ('workspace', 'workspace'))
    ORDER BY n.nspname, c.relname, constraint_row.conname
  `, 'd4a71bdec99ca495c0699cce99f3e5ca014537ffaf3ed64b499ddf0f4c12e347')
  await assertSignatures(client, 'MIGRATION_002_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' || pg_get_userbyid(p.proowner) || ':' ||
      p.prosecdef || ':' || array_to_string(p.proconfig, ',') || ':' || pg_get_function_result(p.oid) AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('iam', 'workspace')
      AND p.proname IN ('establish_workspace_creator_access', 'list_workspace_memberships',
        'complete_create_workspace_receipt', 'create_workspace', 'list_workspace_summaries',
        'reserve_or_replay_create_workspace')
    ORDER BY n.nspname, p.proname
  `, s2Functions)
  await assertRowsDigest(client, 'MIGRATION_002_CATALOG_REFUSED', `
    SELECT n.nspname AS schema, p.proname, oidvectortypes(p.proargtypes) AS args, language_row.lanname,
      p.provolatile, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_language AS language_row ON language_row.oid = p.prolang
    WHERE n.nspname IN ('iam', 'workspace')
      AND p.proname IN ('establish_workspace_creator_access', 'list_workspace_memberships',
        'complete_create_workspace_receipt', 'create_workspace', 'list_workspace_summaries',
        'reserve_or_replay_create_workspace')
    ORDER BY n.nspname, p.proname
  `, 'a40ba945be1e3730ad7563f1bf510a9227f3fdda115f419cccc9527e2860e67e')
  await assertSignatures(client, 'MIGRATION_002_CATALOG_REFUSED', `
    WITH roles(role_name) AS (VALUES ('hub_s2_read'), ('hub_ws01_command'), ('public'))
    SELECT roles.role_name || ':' || n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature
    FROM roles CROSS JOIN pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('iam', 'workspace')
      AND p.proname IN ('establish_workspace_creator_access', 'list_workspace_memberships',
        'complete_create_workspace_receipt', 'create_workspace', 'list_workspace_summaries',
        'reserve_or_replay_create_workspace')
      AND has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
    ORDER BY roles.role_name, n.nspname, p.proname
  `, s2Execute)
  await assertSignatures(client, 'MIGRATION_002_CATALOG_REFUSED', `
    SELECT grantee || ':' || table_schema || '.' || table_name || ':' || privilege_type AS signature
    FROM information_schema.table_privileges
    WHERE table_schema IN ('iam', 'workspace') AND grantee IN ('hub_s2_read', 'hub_ws01_command', 'PUBLIC')
    ORDER BY grantee, table_schema, table_name, privilege_type
  `, [])
  await assertSignatures(client, 'MIGRATION_002_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || c.relname || ':' || trigger_row.tgname AS signature
    FROM pg_trigger AS trigger_row JOIN pg_class AS c ON c.oid = trigger_row.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('iam', 'workspace') AND NOT trigger_row.tgisinternal
    ORDER BY n.nspname, c.relname, trigger_row.tgname
  `, [])
  const boundary = (await client.query(`
    SELECT has_schema_privilege('hub_ws01_command', 'iam', 'USAGE') AS command_iam_usage,
      has_schema_privilege('hub_ws01_command', 'workspace', 'USAGE') AS command_workspace_usage,
      has_schema_privilege('hub_ws01_command', 'iam', 'CREATE') AS command_iam_create,
      has_schema_privilege('hub_ws01_command', 'workspace', 'CREATE') AS command_workspace_create,
      has_schema_privilege('hub_s2_read', 'iam', 'USAGE') AS read_iam_usage,
      has_schema_privilege('hub_s2_read', 'workspace', 'USAGE') AS read_workspace_usage,
      has_schema_privilege('hub_s2_read', 'iam', 'CREATE') AS read_iam_create,
      has_schema_privilege('hub_s2_read', 'workspace', 'CREATE') AS read_workspace_create,
      has_schema_privilege('public', 'workspace', 'USAGE') AS public_workspace_usage,
      pg_has_role('hub_ws01_command', 'workspace_owner', 'MEMBER') AS command_owner_member,
      pg_has_role('hub_s2_read', 'iam_owner', 'MEMBER') AS read_owner_member
  `)).rows[0]
  const expectedBoundary = {
    command_iam_usage: true, command_workspace_usage: true, command_iam_create: false, command_workspace_create: false,
    read_iam_usage: true, read_workspace_usage: true, read_iam_create: false, read_workspace_create: false,
    public_workspace_usage: false, command_owner_member: false, read_owner_member: false,
  }
  if (JSON.stringify(boundary) !== JSON.stringify(expectedBoundary)) fail('MIGRATION_002_CATALOG_REFUSED')
}

const s3Columns = [
  'iam.account_project_grant:account_id:uuid:NO', 'iam.account_project_grant:project_id:uuid:NO',
  'iam.account_project_grant:can_read:bool:NO', 'iam.account_project_grant:can_manage:bool:NO',
  'iam.account_project_grant:created_at:timestamptz:NO',
  'project.operation_idempotency:operation_id:text:NO', 'project.operation_idempotency:account_id:uuid:NO',
  'project.operation_idempotency:workspace_id:uuid:NO', 'project.operation_idempotency:key_digest:text:NO',
  'project.operation_idempotency:request_digest:text:NO', 'project.operation_idempotency:reserved_project_id:uuid:NO',
  'project.operation_idempotency:outcome:text:NO', 'project.operation_idempotency:response_status:int4:YES',
  'project.operation_idempotency:response_digest:text:YES', 'project.operation_idempotency:response_body:jsonb:YES',
  'project.operation_idempotency:created_at:timestamptz:NO', 'project.operation_idempotency:completed_at:timestamptz:YES',
  'project.project:project_id:uuid:NO', 'project.project:workspace_id:uuid:NO', 'project.project:name:text:NO',
  'project.project:source_mode:text:NO', 'project.project:source_revision:text:NO',
  'project.project:project_revision:text:NO', 'project.project:archived:bool:NO', 'project.project:created_at:timestamptz:NO',
]
const s3Constraints = [
  'iam.account_project_grant:account_project_grant_account_id_fkey:f:FOREIGN KEY (account_id) REFERENCES iam.account(account_id)',
  'iam.account_project_grant:account_project_grant_can_manage_check:c:',
  'iam.account_project_grant:account_project_grant_can_read_check:c:',
  'iam.account_project_grant:account_project_grant_pkey:p:',
  'iam.account_project_grant:account_project_grant_project_id_fkey:f:FOREIGN KEY (project_id) REFERENCES project.project(project_id) ON DELETE RESTRICT',
  'project.operation_idempotency:operation_idempotency_check:c:',
  'project.operation_idempotency:operation_idempotency_key_digest_check:c:',
  'project.operation_idempotency:operation_idempotency_operation_id_check:c:',
  'project.operation_idempotency:operation_idempotency_outcome_check:c:',
  'project.operation_idempotency:operation_idempotency_pkey:p:',
  'project.operation_idempotency:operation_idempotency_request_digest_check:c:',
  'project.operation_idempotency:operation_idempotency_reserved_project_id_key:u:',
  'project.operation_idempotency:operation_idempotency_response_digest_check:c:',
  'project.project:project_name_check:c:',
  'project.project:project_pkey:p:',
  'project.project:project_project_revision_check:c:',
  'project.project:project_source_mode_check:c:',
  'project.project:project_source_revision_check:c:',
  'project.project:project_workspace_id_fkey:f:FOREIGN KEY (workspace_id) REFERENCES workspace.workspace(workspace_id) ON DELETE RESTRICT',
]
const s3Functions = [
  'iam.establish_project_creator_grant(uuid, uuid, text, text, uuid):iam_owner:true:search_path=pg_catalog, pg_temp:void',
  'project.complete_create_project_receipt(uuid, uuid, text, text, uuid, integer, text, jsonb):project_owner:true:search_path=pg_catalog, pg_temp:void',
  'project.create_project_with_source(uuid, uuid, text, text, uuid, text, text, text, text):project_owner:true:search_path=pg_catalog, pg_temp:void',
  'project.lock_create_project_receipt(uuid, uuid, text, text, uuid):project_owner:true:search_path=pg_catalog, pg_temp:TABLE(outcome text, project_id uuid)',
  'project.reserve_or_replay_create_project(uuid, uuid, text, text, uuid):project_owner:true:search_path=pg_catalog, pg_temp:TABLE(state text, project_id uuid, response_status integer, response_body jsonb)',
]

const s4Functions = [
  'project.claim_abandoned_create_project_attempt(uuid, uuid, text, text, uuid, timestamp with time zone):project_owner:true:search_path=pg_catalog, pg_temp:uuid',
]

const s5Functions = [
  'project.claim_abandoned_create_project_attempt(timestamp with time zone, integer):project_owner:true:search_path=pg_catalog, pg_temp:TABLE(account_id uuid, workspace_id uuid, key_digest text, request_digest text, project_id uuid)',
  'project.claim_abandoned_create_project_attempt(uuid, uuid, text, text, uuid, timestamp with time zone):project_owner:true:search_path=pg_catalog, pg_temp:uuid',
]

const expected003FunctionBodies = (migration, replacementMigration) => {
  const definitions = []
  const pattern = /CREATE OR REPLACE FUNCTION (iam|project)\.([a-z0-9_]+)\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/g
  for (const match of migration.bytes.toString('utf8').matchAll(pattern)) {
    definitions.push({ schema: match[1], name: match[2], definition: match[3] })
  }
  definitions.sort((left, right) => `${left.schema}.${left.name}`.localeCompare(`${right.schema}.${right.name}`))
  if (JSON.stringify(definitions.map(({ schema, name }) => `${schema}.${name}`)) !== JSON.stringify([
    'iam.establish_project_creator_grant',
    'project.complete_create_project_receipt',
    'project.create_project_with_source',
    'project.lock_create_project_receipt',
    'project.reserve_or_replay_create_project',
  ])) fail('MIGRATION_003_FUNCTION_SOURCE_REFUSED')
  if (replacementMigration) {
    const replacements = []
    const replacementPattern = /CREATE OR REPLACE FUNCTION project\.([a-z0-9_]+)\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/g
    for (const match of replacementMigration.bytes.toString('utf8').matchAll(replacementPattern)) {
      replacements.push({ name: match[1], definition: match[2] })
    }
    if (JSON.stringify(replacements.map(({ name }) => name).sort()) !== JSON.stringify([
      'lock_create_project_receipt',
      'reserve_or_replay_create_project',
    ])) fail('MIGRATION_006_FUNCTION_SOURCE_REFUSED')
    for (const replacement of replacements) {
      const target = definitions.find(({ schema, name }) => schema === 'project' && name === replacement.name)
      if (!target) fail('MIGRATION_006_FUNCTION_SOURCE_REFUSED')
      target.definition = replacement.definition
    }
  }
  return definitions
}

const assert003Catalog = async (client, migration, replacementMigration) => {
  await assert002Catalog(client)
  await assertSignatures(client, 'MIGRATION_003_CATALOG_REFUSED', `
    SELECT rolname || ':' || rolcanlogin || ':' || rolsuper || ':' || rolinherit || ':' || rolcreaterole || ':' ||
      rolcreatedb || ':' || rolreplication || ':' || rolbypassrls AS signature
    FROM pg_roles WHERE rolname IN ('hub_prj03_command', 'project_owner') ORDER BY rolname
  `, [
    'hub_prj03_command:true:false:false:false:false:false:false',
    'project_owner:false:false:false:false:false:false:false',
  ])
  await assertSignatures(client, 'MIGRATION_003_CATALOG_REFUSED', `
    SELECT nspname || ':' || pg_get_userbyid(nspowner) AS signature
    FROM pg_namespace WHERE nspname = 'project'
  `, ['project:project_owner'])
  await assertSignatures(client, 'MIGRATION_003_CATALOG_REFUSED', `
    SELECT table_schema || '.' || table_name || ':' || column_name || ':' || udt_name || ':' || is_nullable AS signature
    FROM information_schema.columns
    WHERE (table_schema, table_name) IN (('iam', 'account_project_grant'),
      ('project', 'operation_idempotency'), ('project', 'project'))
    ORDER BY table_schema, table_name, ordinal_position
  `, s3Columns)
  await assertSignatures(client, 'MIGRATION_003_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || c.relname || ':' || constraint_row.conname || ':' || constraint_row.contype::text || ':' ||
      CASE WHEN constraint_row.contype = 'f' THEN pg_get_constraintdef(constraint_row.oid, true) ELSE '' END AS signature
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS c ON c.oid = constraint_row.conrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE (n.nspname, c.relname) IN (('iam', 'account_project_grant'),
      ('project', 'operation_idempotency'), ('project', 'project'))
    ORDER BY n.nspname, c.relname, constraint_row.conname
  `, s3Constraints)
  await assertSignatures(client, 'MIGRATION_003_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' || pg_get_userbyid(p.proowner) || ':' ||
      p.prosecdef || ':' || array_to_string(p.proconfig, ',') || ':' || pg_get_function_result(p.oid) AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('iam', 'establish_project_creator_grant'),
      ('project', 'complete_create_project_receipt'),
      ('project', 'create_project_with_source'),
      ('project', 'lock_create_project_receipt'),
      ('project', 'reserve_or_replay_create_project'))
    ORDER BY n.nspname, p.proname
  `, s3Functions)
  const functionBodies = (await client.query(`
    SELECT n.nspname AS schema, p.proname AS name, p.prosrc AS definition
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('iam', 'establish_project_creator_grant'),
      ('project', 'complete_create_project_receipt'),
      ('project', 'create_project_with_source'),
      ('project', 'lock_create_project_receipt'),
      ('project', 'reserve_or_replay_create_project'))
    ORDER BY n.nspname, p.proname
  `)).rows
  if (JSON.stringify(functionBodies) !== JSON.stringify(expected003FunctionBodies(migration, replacementMigration))) {
    fail('MIGRATION_003_FUNCTION_SOURCE_REFUSED')
  }
  await assertSignatures(client, 'MIGRATION_003_CATALOG_REFUSED', `
    WITH roles(role_name) AS (VALUES ('hub_prj03_command'), ('public'))
    SELECT roles.role_name || ':' || n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature
    FROM roles CROSS JOIN pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('iam', 'establish_project_creator_grant'),
      ('project', 'complete_create_project_receipt'),
      ('project', 'create_project_with_source'),
      ('project', 'lock_create_project_receipt'),
      ('project', 'reserve_or_replay_create_project'))
      AND has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
    ORDER BY roles.role_name, n.nspname, p.proname
  `, s3Functions.map((signature) => `hub_prj03_command:${signature.split(':')[0]}`))
  await assertSignatures(client, 'MIGRATION_003_CATALOG_REFUSED', `
    SELECT grantee || ':' || table_schema || '.' || table_name || ':' || privilege_type AS signature
    FROM information_schema.table_privileges
    WHERE table_schema IN ('iam', 'project', 'workspace')
      AND grantee IN ('hub_prj03_command', 'PUBLIC')
    ORDER BY grantee, table_schema, table_name, privilege_type
  `, [])
  const boundary = (await client.query(`
    SELECT has_schema_privilege('hub_prj03_command', 'iam', 'USAGE') AS command_iam_usage,
      has_schema_privilege('hub_prj03_command', 'workspace', 'USAGE') AS command_workspace_usage,
      has_schema_privilege('hub_prj03_command', 'project', 'USAGE') AS command_project_usage,
      has_schema_privilege('hub_prj03_command', 'project', 'CREATE') AS command_project_create,
      has_schema_privilege('public', 'project', 'USAGE') AS public_project_usage,
      pg_has_role('hub_prj03_command', 'project_owner', 'MEMBER') AS command_project_owner_member,
      pg_has_role('hub_prj03_command', 'iam_owner', 'MEMBER') AS command_iam_owner_member,
      has_table_privilege('project_owner', 'workspace.workspace', 'REFERENCES') AS project_workspace_reference,
      has_table_privilege('iam_owner', 'project.project', 'REFERENCES') AS iam_project_reference,
      has_column_privilege('iam_owner', 'project.project', 'project_id', 'SELECT') AS iam_project_id_read,
      has_column_privilege('iam_owner', 'project.project', 'workspace_id', 'SELECT') AS iam_workspace_id_read,
      has_column_privilege('iam_owner', 'project.project', 'name', 'SELECT') AS iam_project_name_read
  `)).rows[0]
  const expectedBoundary = {
    command_iam_usage: true, command_workspace_usage: false, command_project_usage: true,
    command_project_create: false, public_project_usage: false,
    command_project_owner_member: false, command_iam_owner_member: false,
    project_workspace_reference: true, iam_project_reference: true,
    iam_project_id_read: true, iam_workspace_id_read: true, iam_project_name_read: false,
  }
  if (JSON.stringify(boundary) !== JSON.stringify(expectedBoundary)) fail('MIGRATION_003_CATALOG_REFUSED')
}

const expected004FunctionBodies = (migration) => {
  const definitions = []
  const pattern = /CREATE FUNCTION (iam|project)\.([a-z0-9_]+)\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/g
  for (const match of migration.bytes.toString('utf8').matchAll(pattern)) {
    definitions.push({ schema: match[1], name: match[2], definition: match[3] })
  }
  if (JSON.stringify(definitions.map(({ schema, name }) => `${schema}.${name}`)) !== JSON.stringify([
    'project.claim_abandoned_create_project_attempt',
  ])) fail('MIGRATION_004_FUNCTION_SOURCE_REFUSED')
  return definitions
}

const assert004Catalog = async (client, migration003, migration004) => {
  await assert003Catalog(client, migration003)
  await assertSignatures(client, 'MIGRATION_004_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' || pg_get_userbyid(p.proowner) || ':' ||
      p.prosecdef || ':' || array_to_string(p.proconfig, ',') || ':' || pg_get_function_result(p.oid) AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'project' AND p.proname = 'claim_abandoned_create_project_attempt'
    ORDER BY n.nspname, p.proname
  `, s4Functions)
  const functionBodies = (await client.query(`
    SELECT n.nspname AS schema, p.proname AS name, p.prosrc AS definition
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'project' AND p.proname = 'claim_abandoned_create_project_attempt'
    ORDER BY n.nspname, p.proname
  `)).rows
  if (JSON.stringify(functionBodies) !== JSON.stringify(expected004FunctionBodies(migration004))) {
    fail('MIGRATION_004_FUNCTION_SOURCE_REFUSED')
  }
  await assertSignatures(client, 'MIGRATION_004_CATALOG_REFUSED', `
    WITH roles(role_name) AS (VALUES ('hub_prj03_command'), ('public'))
    SELECT roles.role_name || ':' || n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature
    FROM roles CROSS JOIN pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'project' AND p.proname = 'claim_abandoned_create_project_attempt'
      AND has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
    ORDER BY roles.role_name, n.nspname, p.proname
  `, s4Functions.map((signature) => `hub_prj03_command:${signature.split(':')[0]}`))
}

const expected005FunctionBodies = (migration) => {
  const definitions = []
  const pattern = /CREATE(?: OR REPLACE)? FUNCTION project\.claim_abandoned_create_project_attempt\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/g
  for (const match of migration.bytes.toString('utf8').matchAll(pattern)) definitions.push(match[1])
  definitions.sort()
  if (definitions.length !== 2) fail('MIGRATION_005_FUNCTION_SOURCE_REFUSED')
  return definitions
}

const assert005Catalog = async (client, migration003, migration005, replacementMigration) => {
  await assert003Catalog(client, migration003, replacementMigration)
  await assertSignatures(client, 'MIGRATION_005_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' || pg_get_userbyid(p.proowner) || ':' ||
      p.prosecdef || ':' || array_to_string(p.proconfig, ',') || ':' || pg_get_function_result(p.oid) AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'project' AND p.proname = 'claim_abandoned_create_project_attempt'
    ORDER BY oidvectortypes(p.proargtypes)
  `, s5Functions)
  const functionBodies = (await client.query(`
    SELECT p.prosrc AS definition
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'project' AND p.proname = 'claim_abandoned_create_project_attempt'
    ORDER BY p.prosrc
  `)).rows.map(({ definition }) => definition)
  if (JSON.stringify(functionBodies) !== JSON.stringify(expected005FunctionBodies(migration005))) {
    fail('MIGRATION_005_FUNCTION_SOURCE_REFUSED')
  }
  await assertSignatures(client, 'MIGRATION_005_CATALOG_REFUSED', `
    WITH roles(role_name) AS (VALUES ('hub_prj03_command'), ('public'))
    SELECT roles.role_name || ':' || n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature
    FROM roles CROSS JOIN pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'project' AND p.proname = 'claim_abandoned_create_project_attempt'
      AND has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
    ORDER BY roles.role_name, oidvectortypes(p.proargtypes)
  `, s5Functions.map((signature) => `hub_prj03_command:${signature.split(':')[0]}`))
}

const expected006CanCreateProjectBody = (migration) => {
  const match = /CREATE FUNCTION iam\.can_create_project\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/.exec(migration.bytes.toString('utf8'))
  if (!match) fail('MIGRATION_006_FUNCTION_SOURCE_REFUSED')
  return match[1]
}

const assert006Catalog = async (client, migration003, migration005, migration006) => {
  await assert005Catalog(client, migration003, migration005, migration006)
  await assertSignatures(client, 'MIGRATION_006_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' || pg_get_userbyid(p.proowner) || ':' ||
      p.prosecdef || ':' || array_to_string(p.proconfig, ',') || ':' || pg_get_function_result(p.oid) AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'iam' AND p.proname = 'can_create_project'
  `, ['iam.can_create_project(uuid, uuid):iam_owner:true:search_path=pg_catalog, pg_temp:boolean'])
  const functionBody = (await client.query(`
    SELECT p.prosrc AS definition
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'iam' AND p.proname = 'can_create_project'
  `)).rows
  if (JSON.stringify(functionBody) !== JSON.stringify([{ definition: expected006CanCreateProjectBody(migration006) }])) {
    fail('MIGRATION_006_FUNCTION_SOURCE_REFUSED')
  }
  await assertSignatures(client, 'MIGRATION_006_CATALOG_REFUSED', `
    WITH roles(role_name) AS (VALUES ('hub_prj03_command'), ('project_owner'), ('public'))
    SELECT roles.role_name || ':iam.can_create_project(uuid, uuid)' AS signature
    FROM roles CROSS JOIN pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'iam' AND p.proname = 'can_create_project'
      AND has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
    ORDER BY roles.role_name
  `, ['project_owner:iam.can_create_project(uuid, uuid)'])
}

const assert007Catalog = async (client, migration003, migration005, migration006) => {
  await assert006Catalog(client, migration003, migration005, migration006)
  await assertSignatures(client, 'MIGRATION_007_CATALOG_REFUSED', `
    SELECT rolname || ':' || rolcanlogin || ':' || rolsuper || ':' || rolinherit || ':' || rolcreaterole || ':' ||
      rolcreatedb || ':' || rolreplication || ':' || rolbypassrls AS signature
    FROM pg_roles WHERE rolname = 'hub_s3_read'
  `, ['hub_s3_read:true:false:false:false:false:false:false'])
  await assertSignatures(client, 'MIGRATION_007_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' ||
      pg_get_userbyid(p.proowner) || ':' || p.prosecdef || ':' ||
      array_to_string(p.proconfig, ',') || ':' || pg_get_function_result(p.oid) AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('iam', 'admit_project_read'),
      ('iam', 'list_workspace_readable_project_ids'),
      ('project', 'get_project_representation'),
      ('project', 'list_project_summaries')
    ) ORDER BY n.nspname, p.proname
  `, [
    'iam.admit_project_read(uuid, uuid):iam_owner:true:search_path=pg_catalog, pg_temp:TABLE(project_id uuid)',
    'iam.list_workspace_readable_project_ids(uuid, uuid):iam_owner:true:search_path=pg_catalog, pg_temp:TABLE(project_id uuid)',
    'project.get_project_representation(uuid, uuid[]):project_owner:true:search_path=pg_catalog, pg_temp:TABLE(project_id uuid, workspace_id uuid, name text, project_revision text, archived boolean)',
    'project.list_project_summaries(uuid, uuid[]):project_owner:true:search_path=pg_catalog, pg_temp:TABLE(project_id uuid, workspace_id uuid, name text, archived boolean)',
  ])
  await assertSignatures(client, 'MIGRATION_007_PRIVILEGE_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('iam', 'project')
      AND has_function_privilege('hub_s3_read', p.oid, 'EXECUTE')
    ORDER BY n.nspname, p.proname, oidvectortypes(p.proargtypes)
  `, [
    'iam.admit_project_read(uuid, uuid)',
    'iam.list_workspace_readable_project_ids(uuid, uuid)',
    'project.get_project_representation(uuid, uuid[])',
    'project.list_project_summaries(uuid, uuid[])',
  ])
  const boundary = (await client.query(`
    SELECT has_schema_privilege('hub_s3_read', 'iam', 'USAGE') AS iam_usage,
      has_schema_privilege('hub_s3_read', 'project', 'USAGE') AS project_usage,
      has_schema_privilege('hub_s3_read', 'workspace', 'USAGE') AS workspace_usage,
      has_schema_privilege('hub_s3_read', 'iam', 'CREATE') AS iam_create,
      has_schema_privilege('hub_s3_read', 'project', 'CREATE') AS project_create,
      pg_has_role('hub_s3_read', 'iam_owner', 'MEMBER') AS iam_owner_member,
      pg_has_role('hub_s3_read', 'project_owner', 'MEMBER') AS project_owner_member,
      EXISTS (SELECT 1 FROM information_schema.table_privileges
              WHERE grantee = 'hub_s3_read') AS table_privilege
  `)).rows[0]
  if (JSON.stringify(boundary) !== JSON.stringify({
    iam_usage: true,
    project_usage: true,
    workspace_usage: false,
    iam_create: false,
    project_create: false,
    iam_owner_member: false,
    project_owner_member: false,
    table_privilege: false,
  })) fail('MIGRATION_007_PRIVILEGE_REFUSED')
}

const assert008Catalog = async (client, migration003, migration005, migration006) => {
  await assert007Catalog(client, migration003, migration005, migration006)
  await assertSignatures(client, 'MIGRATION_008_CATALOG_REFUSED', `
    SELECT rolname || ':' || rolcanlogin || ':' || rolsuper || ':' || rolinherit || ':' || rolcreaterole || ':' ||
      rolcreatedb || ':' || rolreplication || ':' || rolbypassrls AS signature
    FROM pg_roles WHERE rolname IN ('hub_s4_baseline_command', 'hub_s4_baseline_read') ORDER BY rolname
  `, [
    'hub_s4_baseline_command:true:false:false:false:false:false:false',
    'hub_s4_baseline_read:true:false:false:false:false:false:false',
  ])
  await assertSignatures(client, 'MIGRATION_008_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || c.relname || ':' || c.relkind::text || ':' || pg_get_userbyid(c.relowner) AS signature
    FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'project' AND c.relname IN ('baseline_approval', 'baseline_candidate', 'baseline_state')
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    ORDER BY c.relname
  `, [
    'project.baseline_approval:r:project_owner',
    'project.baseline_candidate:r:project_owner',
    'project.baseline_state:r:project_owner',
  ])
  await assertSignatures(client, 'MIGRATION_008_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' ||
      pg_get_userbyid(p.proowner) || ':' || p.prosecdef || ':' ||
      array_to_string(p.proconfig, ',') || ':' || pg_get_function_result(p.oid) AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('iam', 'admit_project_manage'),
      ('project', 'approve_baseline_revision'),
      ('project', 'get_approved_baseline'),
      ('project', 'get_baseline_candidate')
    ) ORDER BY n.nspname, p.proname
  `, [
    'iam.admit_project_manage(uuid, uuid):iam_owner:true:search_path=pg_catalog, pg_temp:TABLE(project_id uuid)',
    'project.approve_baseline_revision(uuid, uuid, text, uuid, uuid[]):project_owner:true:search_path=pg_catalog, pg_temp:TABLE(baseline_digest text, source_revision text, source_text text, application_runtime_profile text, approval_revision uuid)',
    'project.get_approved_baseline(uuid, uuid[]):project_owner:true:search_path=pg_catalog, pg_temp:TABLE(baseline_digest text, source_revision text, source_text text, application_runtime_profile text)',
    'project.get_baseline_candidate(uuid, text, uuid[]):project_owner:true:search_path=pg_catalog, pg_temp:TABLE(candidate_baseline_digest text, source_revision text, source_text text, application_runtime_profile text)',
  ])
  await assertSignatures(client, 'MIGRATION_008_PRIVILEGE_REFUSED', `
    WITH roles(role_name) AS (VALUES ('hub_s4_baseline_command'), ('hub_s4_baseline_read'))
    SELECT roles.role_name || ':' || n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature
    FROM roles CROSS JOIN pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('iam', 'project') AND has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
    ORDER BY roles.role_name, n.nspname, p.proname
  `, [
    'hub_s4_baseline_command:iam.admit_project_manage(uuid, uuid)',
    'hub_s4_baseline_command:project.approve_baseline_revision(uuid, uuid, text, uuid, uuid[])',
    'hub_s4_baseline_read:iam.admit_project_manage(uuid, uuid)',
    'hub_s4_baseline_read:project.get_approved_baseline(uuid, uuid[])',
    'hub_s4_baseline_read:project.get_baseline_candidate(uuid, text, uuid[])',
  ])
  const boundary = (await client.query(`
    SELECT has_schema_privilege('hub_s4_baseline_read', 'iam', 'USAGE') AS read_iam_usage,
      has_schema_privilege('hub_s4_baseline_read', 'project', 'USAGE') AS read_project_usage,
      has_schema_privilege('hub_s4_baseline_read', 'project', 'CREATE') AS read_project_create,
      has_schema_privilege('hub_s4_baseline_command', 'iam', 'USAGE') AS command_iam_usage,
      has_schema_privilege('hub_s4_baseline_command', 'project', 'USAGE') AS command_project_usage,
      has_schema_privilege('hub_s4_baseline_command', 'project', 'CREATE') AS command_project_create,
      pg_has_role('hub_s4_baseline_read', 'project_owner', 'MEMBER') AS read_owner_member,
      pg_has_role('hub_s4_baseline_command', 'project_owner', 'MEMBER') AS command_owner_member,
      EXISTS (SELECT 1 FROM information_schema.table_privileges
              WHERE grantee IN ('hub_s4_baseline_read', 'hub_s4_baseline_command')) AS table_privilege,
      to_regprocedure('project.inject_baseline_candidate(uuid,text,text,text)') IS NOT NULL AS injection_present
  `)).rows[0]
  if (JSON.stringify(boundary) !== JSON.stringify({
    read_iam_usage: true,
    read_project_usage: true,
    read_project_create: false,
    command_iam_usage: true,
    command_project_usage: true,
    command_project_create: false,
    read_owner_member: false,
    command_owner_member: false,
    table_privilege: false,
    injection_present: false,
  })) fail('MIGRATION_008_PRIVILEGE_REFUSED')
}

const assertLegacy001Catalog = async (client) => assert001Catalog(client)

const assert009Catalog = async (client, migration003, migration005, migration006, { with010 = false } = {}) => {
  await assert008Catalog(client, migration003, migration005, migration006)
  await assertSignatures(client, 'MIGRATION_009_CATALOG_REFUSED', `
    SELECT rolname || ':' || rolcanlogin || ':' || rolsuper || ':' || rolinherit || ':' || rolcreaterole || ':' ||
      rolcreatedb || ':' || rolreplication || ':' || rolbypassrls AS signature
    FROM pg_roles WHERE rolname = 'hub_s6_inception_command'
  `, ['hub_s6_inception_command:true:false:false:false:false:false:false'])
  await assertSignatures(client, 'MIGRATION_009_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || c.relname || ':' || c.relkind::text || ':' || pg_get_userbyid(c.relowner) AS signature
    FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'project' AND c.relname = 'inception_idempotency'
  `, ['project.inception_idempotency:r:project_owner'])
  await assertSignatures(client, 'MIGRATION_009_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' ||
      pg_get_userbyid(p.proowner) || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ',') AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'project' AND p.proname IN ('abandon_inception', 'complete_inception', 'reserve_or_replay_inception')
    ORDER BY p.proname
  `, [
    'project.abandon_inception(uuid, uuid, text, uuid):project_owner:true:search_path=pg_catalog, pg_temp',
    `project.complete_inception(${with010
      ? 'uuid, uuid, text, text, uuid, text, text, text, text, text, jsonb'
      : 'uuid, uuid, text, text, uuid, text, text, text, text, jsonb'}):project_owner:true:search_path=pg_catalog, pg_temp`,
    'project.reserve_or_replay_inception(uuid, uuid, text, text, uuid, text):project_owner:true:search_path=pg_catalog, pg_temp',
  ])
  await assertSignatures(client, 'MIGRATION_009_PRIVILEGE_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('iam', 'project')
      AND has_function_privilege('hub_s6_inception_command', p.oid, 'EXECUTE')
    ORDER BY n.nspname, p.proname
  `, [
    'project.abandon_inception(uuid, uuid, text, uuid)',
    `project.complete_inception(${with010
      ? 'uuid, uuid, text, text, uuid, text, text, text, text, text, jsonb'
      : 'uuid, uuid, text, text, uuid, text, text, text, text, jsonb'})`,
    'project.reserve_or_replay_inception(uuid, uuid, text, text, uuid, text)',
  ])
  const boundary = (await client.query(`
    SELECT has_schema_privilege('hub_s6_inception_command', 'iam', 'USAGE') AS iam_usage,
      has_schema_privilege('hub_s6_inception_command', 'project', 'USAGE') AS project_usage,
      has_schema_privilege('hub_s6_inception_command', 'project', 'CREATE') AS project_create,
      pg_has_role('hub_s6_inception_command', 'project_owner', 'MEMBER') AS owner_member,
      EXISTS (SELECT 1 FROM information_schema.table_privileges
              WHERE grantee = 'hub_s6_inception_command') AS table_privilege
  `)).rows[0]
  if (JSON.stringify(boundary) !== JSON.stringify({
    iam_usage: true, project_usage: true, project_create: false,
    owner_member: false, table_privilege: false,
  })) fail('MIGRATION_009_PRIVILEGE_REFUSED')
}

const assert010Catalog = async (client, migration003, migration005, migration006) => {
  await assert009Catalog(client, migration003, migration005, migration006, { with010: true })
  await assertSignatures(client, 'MIGRATION_010_CATALOG_REFUSED', `
    SELECT column_name || ':' || udt_name || ':' || is_nullable AS signature
    FROM information_schema.columns
    WHERE table_schema = 'project' AND table_name = 'inception_idempotency'
      AND column_name = 'prior_candidate_digest'
  `, ['prior_candidate_digest:text:YES'])
  await assertSignatures(client, 'MIGRATION_010_CATALOG_REFUSED', `
    SELECT constraint_row.conname || ':' || constraint_row.contype::text || ':' ||
      pg_get_constraintdef(constraint_row.oid, true) AS signature
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'project' AND relation.relname = 'inception_idempotency'
      AND constraint_row.conname = 'inception_idempotency_prior_candidate_digest_check'
  `, [
    `inception_idempotency_prior_candidate_digest_check:c:CHECK (prior_candidate_digest IS NULL OR prior_candidate_digest ~ '^[0-9a-f]{64}$'::text)`,
  ])
}

const verifyLedger = async (client, migrations) => {
  if (!await tableExists(client, 'iam.schema_migration')) return { applied: new Map(), maximum: null }
  const rows = (await client.query('SELECT version, checksum_sha256 FROM iam.schema_migration ORDER BY version')).rows
  const files = new Map(migrations.map((migration) => [migration.version, migration]))
  for (const row of rows) {
    const migration = files.get(row.version)
    if (!migration) fail('MIGRATION_UNKNOWN_APPLIED', row.version)
    if (migration.checksum !== row.checksum_sha256) fail('MIGRATION_APPLIED_DIGEST_DRIFT', row.version)
  }
  const applied = new Map(rows.map((row) => [row.version, row.checksum_sha256]))
  if (applied.has('010')) await assert010Catalog(client, files.get('003'), files.get('005'), files.get('006'))
  else if (applied.has('009')) await assert009Catalog(client, files.get('003'), files.get('005'), files.get('006'))
  else if (applied.has('008')) await assert008Catalog(client, files.get('003'), files.get('005'), files.get('006'))
  else if (applied.has('007')) await assert007Catalog(client, files.get('003'), files.get('005'), files.get('006'))
  else if (applied.has('006')) await assert006Catalog(client, files.get('003'), files.get('005'), files.get('006'))
  else if (applied.has('005')) await assert005Catalog(client, files.get('003'), files.get('005'))
  else if (applied.has('004')) await assert004Catalog(client, files.get('003'), files.get('004'))
  else if (applied.has('003')) await assert003Catalog(client, files.get('003'))
  else if (applied.has('002')) await assert002Catalog(client)
  else if (applied.has('001')) await assert001Catalog(client)
  return { applied, maximum: rows.at(-1)?.version ?? null }
}

export const runHubMigrations = async ({ connectionString, migrationsRoot = defaultMigrationsRoot }) => {
  const migrations = loadMigrationFiles(migrationsRoot)
  const client = new pg.Client({ connectionString })
  await client.connect()
  const appliedNow = []
  try {
    for (const migration of migrations) {
      await client.query('BEGIN')
      try {
        await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLock.toString()])
        const ledger = await verifyLedger(client, migrations)
        if (ledger.applied.has(migration.version)) {
          await client.query('COMMIT')
          continue
        }
        if (ledger.maximum !== null && migration.version < ledger.maximum) fail('MIGRATION_BACK_INSERT_REFUSED', migration.version)

        if (migration.version === '001' && await tableExists(client, 'iam.schema_migration')) {
          if (migration.checksum !== migration001Digest) fail('MIGRATION_001_DIGEST_REFUSED')
          await assertLegacy001Catalog(client)
          await client.query('INSERT INTO iam.schema_migration(version, checksum_sha256) VALUES ($1, $2)', [migration.version, migration.checksum])
        } else {
          if (migration.version === '001' && await schemaExists(client, 'iam')) fail('MIGRATION_DIRTY_BASELINE_REFUSED')
          await client.query(migrationBody(migration))
          await client.query('INSERT INTO iam.schema_migration(version, checksum_sha256) VALUES ($1, $2)', [migration.version, migration.checksum])
        }
        await client.query('COMMIT')
        appliedNow.push(migration.version)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
    await client.query('BEGIN')
    try {
      await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLock.toString()])
      const ledger = await verifyLedger(client, migrations)
      await client.query('COMMIT')
      return { verdict: 'PASS', appliedNow, versions: [...ledger.applied.keys()] }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  } finally {
    await client.end()
  }
}

const readConnectionString = (path) => {
  if (!path || !existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) fail('MIGRATION_DATABASE_URL_FILE_REFUSED')
  const value = readFileSync(path, 'utf8').trim()
  if (!value) fail('MIGRATION_DATABASE_URL_EMPTY')
  return value
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const connectionString = readConnectionString(process.env.CONEXUS_MIGRATION_DATABASE_URL_FILE)
  process.stdout.write(`${JSON.stringify(await runHubMigrations({ connectionString }))}\n`)
}
