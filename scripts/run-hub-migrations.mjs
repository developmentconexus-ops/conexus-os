import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const repositoryRoot = resolve(import.meta.dirname, '..')
const defaultMigrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
const migrationPattern = /^(\d{3})_[a-z0-9_]+\.sql$/
const r1MigrationNames = [
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
const r2MigrationNames = ['011_r2_brain_connections.sql', '012_r2_project_binding_recovery.sql', '013_r2_binding_source_concordance.sql', '014_r2_brain_binding_settlement.sql', '015_r2_project_brain_read_envelopes.sql', '016_r2_brain_binding_removal.sql', '017_r2_key_conformance_subject.sql', '018_r2_brain_revision_selection.sql']
const expectedMigrationNames = [...r1MigrationNames, ...r2MigrationNames, '019_rb_builder_first_vertical.sql']
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
const migration011Digest = 'e9b3cbfe9be43536f7a4d130f0650799e13c2c65fe36d6cd1dc8bdd65c8d917f'
const migration012Digest = 'c34a67137d88d49deb2bfba6de317d243fbebad0fb501e40dd53dce354b3adcf'
const migration013Digest = 'cd3a7f19963aef2a4e0da2fbf13b1b09d3d24f512f69c0f2cb1f9fe381bd8c98'
const migration014Digest = '519680aac42b07877493f67e554b88b4fe553f0da9d6889d6ffb7ef60d011f63'
const migration015Digest = 'ad10379d135d8bdd238fe114f6fcb7c26fb51adc4c5d5b186a8791c8f0b4526c'
const migration016Digest = '75c7f915ca25f9ebdf29f2e047b68903f25232a92dc38b434717f2df8c11903b'
const migration017Digest = '6627c95995e642579257b80450c4c0d342a5deaa9a73f3fe57ff097d666ca61d'
const migration018Digest = '85db476ba4b6acbaa65cf1e538ef760c2812613ae171c0cf13d21394c9d3453c'
const migration019Digest = 'fcb03cac3a0a9df78e6f4be6fbcd99406886cfebdaf0438ea23a3beb5a7dad67'
const advisoryLock = 4_349_395_539_450_322_946n
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }
const loadCurrentMigrationFiles = (migrationsRoot = defaultMigrationsRoot) => {
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
  if (migrations[10].version !== '011' || migrations[10].checksum !== migration011Digest) fail('MIGRATION_011_DIGEST_REFUSED')
  if (migrations[11].version !== '012' || migrations[11].checksum !== migration012Digest) fail('MIGRATION_012_DIGEST_REFUSED')
  if (migrations[12].version !== '013' || migrations[12].checksum !== migration013Digest) fail('MIGRATION_013_DIGEST_REFUSED')
  if (migrations[13].version !== '014' || migrations[13].checksum !== migration014Digest) fail('MIGRATION_014_DIGEST_REFUSED')
  if (migrations[14].version !== '015' || migrations[14].checksum !== migration015Digest) fail('MIGRATION_015_DIGEST_REFUSED')
  if (migrations[15].version !== '016' || migrations[15].checksum !== migration016Digest) fail('MIGRATION_016_DIGEST_REFUSED')
  if (migrations[16].version !== '017' || migrations[16].checksum !== migration017Digest) fail('MIGRATION_017_DIGEST_REFUSED')
  if (migrations[17].version !== '018' || migrations[17].checksum !== migration018Digest) fail('MIGRATION_018_DIGEST_REFUSED')
  if (migrations[18].version !== '019' || migrations[18].checksum !== migration019Digest) fail('MIGRATION_019_DIGEST_REFUSED')
  return migrations
}

export const loadMigrationFiles = (migrationsRoot = defaultMigrationsRoot) =>
  loadCurrentMigrationFiles(migrationsRoot).filter(({ name }) => r1MigrationNames.includes(name))

export const loadR2MigrationFiles = (migrationsRoot = defaultMigrationsRoot) =>
  loadCurrentMigrationFiles(migrationsRoot).filter(({ name }) => [...r1MigrationNames, ...r2MigrationNames].includes(name))

export const loadCurrentHubMigrationFiles = (migrationsRoot = defaultMigrationsRoot) =>
  loadCurrentMigrationFiles(migrationsRoot)

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
  const actualDigest = sha256(JSON.stringify(rows))
  if (actualDigest !== expectedDigest) fail(code, actualDigest)
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

const assert002Catalog = async (client, { withR2Brain = false, r2Migration } = {}) => {
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
  `, [
    ...s2Columns.slice(0, 4),
    ...(withR2Brain ? ['iam.workspace_membership:can_read_brain:bool:NO'] : []),
    ...(r2Migration ? [
      'iam.workspace_membership:can_read_connection:bool:NO',
      'iam.workspace_membership:can_manage_connection:bool:NO',
      'iam.workspace_membership:can_qualify_connection:bool:NO',
    ] : []),
    ...s2Columns.slice(4),
  ])
  await assertRowsDigest(client, 'MIGRATION_002_CATALOG_REFUSED', `
    SELECT table_schema, table_name, column_name, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE (table_schema, table_name) IN (('iam', 'workspace_membership'), ('workspace', 'operation_idempotency'), ('workspace', 'workspace'))
    ORDER BY table_schema, table_name, ordinal_position
  `, r2Migration
    ? '07558999beb4c534e4e1e7fc662b6a4aaf9975bc458cb7aa2f349bc77bf53827'
    : withR2Brain
      ? 'ac51d4e93c7d8f4558f77ddb407d63fde61d69a2e5060b38b6f4a079c724db59'
    : 'ea416e47151dc90aa452ced5cee5b7b8a75dd643e81d070688ea22b3e8e6fcf9')
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
  `, r2Migration
    ? '42ee3cc3f1e0efc228724fd4d33d233ca111aed7b124b33e79a76c1742bd1432'
    : withR2Brain
      ? '1fc1df82c6f4a0a818fddc7938725230327be26cad5cca62ddc50661826bc524'
    : 'a40ba945be1e3730ad7563f1bf510a9227f3fdda115f419cccc9527e2860e67e')
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

const expected003FunctionBodies = (migration, replacementMigration, r2Migration) => {
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
  if (r2Migration) {
    const match = /CREATE OR REPLACE FUNCTION iam\.establish_project_creator_grant\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/.exec(
      r2Migration.bytes.toString('utf8'),
    )
    if (!match) fail('MIGRATION_011_FUNCTION_SOURCE_REFUSED')
    const target = definitions.find(({ schema, name }) => schema === 'iam' && name === 'establish_project_creator_grant')
    if (!target) fail('MIGRATION_011_FUNCTION_SOURCE_REFUSED')
    target.definition = match[1]
  }
  return definitions
}

const assert003Catalog = async (client, migration, replacementMigration, options) => {
  await assert002Catalog(client, options)
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
  `, options?.r2Migration ? [
    ...s3Columns.slice(0, 5),
    'iam.account_project_grant:can_read_connection:bool:NO',
    'iam.account_project_grant:can_manage_connection:bool:NO',
    'iam.account_project_grant:can_qualify_connection:bool:NO',
    'iam.account_project_grant:can_bind_brain:bool:NO',
    'iam.account_project_grant:can_use_connection:bool:NO',
    ...s3Columns.slice(5),
  ] : s3Columns)
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
  if (JSON.stringify(functionBodies) !== JSON.stringify(
    expected003FunctionBodies(migration, replacementMigration, options?.r2Migration),
  )) {
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

const assert004Catalog = async (client, migration003, migration004, options) => {
  await assert003Catalog(client, migration003, undefined, options)
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

const assert005Catalog = async (client, migration003, migration005, replacementMigration, options) => {
  await assert003Catalog(client, migration003, replacementMigration, options)
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

const assert006Catalog = async (client, migration003, migration005, migration006, options) => {
  await assert005Catalog(client, migration003, migration005, migration006, options)
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

const assert007Catalog = async (client, migration003, migration005, migration006, options) => {
  await assert006Catalog(client, migration003, migration005, migration006, options)
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

const assert008Catalog = async (client, migration003, migration005, migration006, options) => {
  await assert007Catalog(client, migration003, migration005, migration006, options)
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

const assert009Catalog = async (
  client,
  migration003,
  migration005,
  migration006,
  { with010 = false, withR2Brain = false, r2Migration } = {},
) => {
  await assert008Catalog(client, migration003, migration005, migration006, { withR2Brain, r2Migration })
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

const assert010Catalog = async (
  client,
  migration003,
  migration005,
  migration006,
  { withR2Brain = false, r2Migration } = {},
) => {
  await assert009Catalog(client, migration003, migration005, migration006, {
    with010: true,
    withR2Brain,
    r2Migration,
  })
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

const expected011FunctionBodies = (migration) => {
  const expectedNames = [
    'brn.bootstrap_brain_health', 'brn.get_brain_health',
    'con.admit_project_binding_revision', 'con.create_or_replay_connection', 'con.get_connection',
    'con.get_connection_qualification', 'con.get_project_binding_name', 'con.list_connections',
    'con.reserve_connection_credential', 'con.reserve_connection_qualification', 'con.revise_connection',
    'con.settle_connection_credential', 'con.settle_connection_qualification',
    'iam.admit_any_connection_read', 'iam.admit_brain_read', 'iam.admit_connection_manage',
    'iam.admit_connection_qualify', 'iam.admit_connection_read', 'iam.admit_connection_selection',
    'iam.establish_project_creator_grant', 'iam.establish_workspace_creator_access',
    'project.list_connection_bindings', 'project.prepare_connection_binding',
    'project.settle_connection_binding', 'reg.bootstrap_workspace_brain', 'reg.get_brain_revision',
    'reg.get_workspace_brain', 'reg.list_brain_revisions',
  ]
  const definitions = []
  const pattern = /CREATE (?:OR REPLACE )?FUNCTION (iam|reg|brn|con|project)\.([a-z0-9_]+)\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/g
  for (const match of migration.bytes.toString('utf8').matchAll(pattern)) {
    const name = `${match[1]}.${match[2]}`
    if (expectedNames.includes(name)) definitions.push({ name, definition: match[3] })
  }
  definitions.sort((left, right) => left.name.localeCompare(right.name))
  if (JSON.stringify(definitions.map(({ name }) => name)) !== JSON.stringify(expectedNames)) {
    fail('MIGRATION_011_FUNCTION_SOURCE_REFUSED')
  }
  return definitions
}

const expected012FunctionBodies = (migration) => {
  const expectedNames = [
    'project.abort_binding_source_intent', 'project.begin_connection_binding_intent',
    'project.complete_binding_source_abort', 'project.complete_binding_source_intent',
    'project.freeze_binding_source_intent', 'project.get_binding_source_intent',
    'project.guard_inception_binding_source', 'project.lock_binding_project',
    'project.validate_binding_source_intent',
  ]
  const definitions = []
  const pattern = /CREATE (?:OR REPLACE )?FUNCTION (iam|reg|brn|con|project)\.([a-z0-9_]+)\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/g
  for (const match of migration.bytes.toString('utf8').matchAll(pattern)) {
    const name = `${match[1]}.${match[2]}`
    if (expectedNames.includes(name)) definitions.push({ name, definition: match[3] })
  }
  definitions.sort((left, right) => left.name.localeCompare(right.name))
  if (JSON.stringify(definitions.map(({ name }) => name)) !== JSON.stringify(expectedNames)) {
    fail('MIGRATION_012_FUNCTION_SOURCE_REFUSED')
  }
  return definitions
}

const expected013FunctionBodies = (migration) => {
  const expectedNames = ['project.get_binding_source_basis']
  const definitions = []
  const pattern = /CREATE (?:OR REPLACE )?FUNCTION (iam|reg|brn|con|project)\.([a-z0-9_]+)\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/g
  for (const match of migration.bytes.toString('utf8').matchAll(pattern)) {
    const name = `${match[1]}.${match[2]}`
    if (expectedNames.includes(name)) definitions.push({ name, definition: match[3] })
  }
  definitions.sort((left, right) => left.name.localeCompare(right.name))
  if (JSON.stringify(definitions.map(({ name }) => name)) !== JSON.stringify(expectedNames)) {
    fail('MIGRATION_013_FUNCTION_SOURCE_REFUSED')
  }
  return definitions
}

const expected014FunctionBodies = (migration) => {
  const expectedNames = [
    'brn.admit_binding_candidate', 'brn.admit_binding_validation', 'brn.canonical_binding_json',
    'brn.persist_binding_validation', 'con.admit_brain_proof_subject', 'iam.admit_brain_binding',
    'project.begin_brain_binding_intent', 'project.complete_binding_source_intent',
    'project.prepare_brain_binding', 'project.settle_brain_binding',
    'project.validate_binding_source_intent', 'reg.admit_project_brain_revision',
  ]
  const definitions = []
  const pattern = /CREATE (?:OR REPLACE )?FUNCTION (iam|reg|brn|con|project)\.([a-z0-9_]+)\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/g
  for (const match of migration.bytes.toString('utf8').matchAll(pattern)) {
    const name = `${match[1]}.${match[2]}`
    if (expectedNames.includes(name)) definitions.push({ name, definition: match[3] })
  }
  definitions.sort((left, right) => left.name.localeCompare(right.name))
  if (JSON.stringify(definitions.map(({ name }) => name)) !== JSON.stringify(expectedNames)) {
    fail('MIGRATION_014_FUNCTION_SOURCE_REFUSED')
  }
  return definitions
}

const expected015FunctionBodies = (migration) => {
  const expectedNames = [
    'brn.get_project_binding_attestation', 'brn.get_project_brain_basis',
    'brn.persist_binding_validation',
    'con.admit_brain_proof_subject',
    'iam.admit_project_brain_context',
    'project.admit_brain_binding_preflight',
    'project.get_project_brain_binding',
    'project.get_project_brain_read_basis',
    'project.prepare_brain_binding',
    'reg.get_project_binding_update', 'reg.get_project_brain_candidate',
    'reg.get_project_brain_snapshot',
  ]
  const definitions = []
  const pattern = /CREATE (?:OR REPLACE )?FUNCTION (iam|reg|brn|con|project)\.([a-z0-9_]+)\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/g
  for (const match of migration.bytes.toString('utf8').matchAll(pattern)) {
    const name = `${match[1]}.${match[2]}`
    if (expectedNames.includes(name)) definitions.push({ name, definition: match[3] })
  }
  definitions.sort((left, right) => left.name.localeCompare(right.name))
  if (JSON.stringify(definitions.map(({ name }) => name)) !== JSON.stringify(expectedNames)) {
    fail('MIGRATION_015_FUNCTION_SOURCE_REFUSED')
  }
  return definitions
}

const expected016FunctionBodies = (migration) => {
  const expectedNames = [
    'project.begin_brain_binding_removal_intent', 'project.complete_binding_source_intent',
    'project.prepare_brain_binding_removal', 'project.settle_brain_binding_removal',
    'project.validate_binding_source_intent',
  ]
  const definitions = []
  const pattern = /CREATE (?:OR REPLACE )?FUNCTION (iam|reg|brn|con|project)\.([a-z0-9_]+)\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/g
  for (const match of migration.bytes.toString('utf8').matchAll(pattern)) {
    const name = `${match[1]}.${match[2]}`
    if (expectedNames.includes(name)) definitions.push({ name, definition: match[3] })
  }
  definitions.sort((left, right) => left.name.localeCompare(right.name))
  if (JSON.stringify(definitions.map(({ name }) => name)) !== JSON.stringify(expectedNames)) {
    fail('MIGRATION_016_FUNCTION_SOURCE_REFUSED')
  }
  return definitions
}

const expected017FunctionBodies = (migration) => {
  const expectedNames = [
    'con.resolve_key_conformance_subject',
    'project.resolve_key_conformance_subject',
  ]
  const definitions = []
  const pattern = /CREATE (?:OR REPLACE )?FUNCTION (iam|reg|brn|con|project)\.([a-z0-9_]+)\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/g
  for (const match of migration.bytes.toString('utf8').matchAll(pattern)) {
    const name = `${match[1]}.${match[2]}`
    if (expectedNames.includes(name)) definitions.push({ name, definition: match[3] })
  }
  definitions.sort((left, right) => left.name.localeCompare(right.name))
  if (JSON.stringify(definitions.map(({ name }) => name)) !== JSON.stringify(expectedNames)) {
    fail('MIGRATION_017_FUNCTION_SOURCE_REFUSED')
  }
  return definitions
}

const expected018FunctionBodies = (migration) => {
  const expectedNames = ['iam.admit_brain_revision_selection']
  const definitions = []
  const pattern = /CREATE (?:OR REPLACE )?FUNCTION (iam|reg|brn|con|project)\.([a-z0-9_]+)\([\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/g
  for (const match of migration.bytes.toString('utf8').matchAll(pattern)) {
    const name = `${match[1]}.${match[2]}`
    if (expectedNames.includes(name)) definitions.push({ name, definition: match[3] })
  }
  if (JSON.stringify(definitions.map(({ name }) => name)) !== JSON.stringify(expectedNames)) {
    fail('MIGRATION_018_FUNCTION_SOURCE_REFUSED')
  }
  return definitions
}

const assert011Catalog = async (
  client,
  migration003,
  migration005,
  migration006,
  migration011,
  { withR2Recovery = false, withR2Concordance = false, after014 = false, after015 = false } = {},
) => {
  await assert010Catalog(client, migration003, migration005, migration006, {
    withR2Brain: true,
    r2Migration: migration011,
  })
  await assertSignatures(client, 'MIGRATION_011_CATALOG_REFUSED', `
    SELECT rolname || ':' || rolcanlogin || ':' || rolsuper || ':' || rolinherit || ':' || rolcreaterole || ':' ||
      rolcreatedb || ':' || rolreplication || ':' || rolbypassrls AS signature
    FROM pg_roles WHERE rolname IN ('brain_owner', 'connections_owner', 'registry_owner') ORDER BY rolname
  `, [
    'brain_owner:false:false:false:false:false:false:false',
    'connections_owner:false:false:false:false:false:false:false',
    'registry_owner:false:false:false:false:false:false:false',
  ])
  await assertSignatures(client, 'MIGRATION_011_CATALOG_REFUSED', `
    SELECT rolname || ':' || rolcanlogin || ':' || rolsuper || ':' || rolinherit || ':' || rolcreaterole || ':' ||
      rolcreatedb || ':' || rolreplication || ':' || rolbypassrls AS signature
    FROM pg_roles WHERE rolname IN ('hub_r2_brain_bootstrap', 'hub_r2_brain_read', 'hub_r2_connections', 'hub_r2_project_binding') ORDER BY rolname
  `, [
    'hub_r2_brain_bootstrap:true:false:false:false:false:false:false',
    'hub_r2_brain_read:true:false:false:false:false:false:false',
    'hub_r2_connections:true:false:false:false:false:false:false',
    'hub_r2_project_binding:true:false:false:false:false:false:false',
  ])
  await assertSignatures(client, 'MIGRATION_011_CATALOG_REFUSED', `
    SELECT nspname || ':' || pg_get_userbyid(nspowner) AS signature
    FROM pg_namespace WHERE nspname IN ('brn', 'con', 'reg') ORDER BY nspname
  `, ['brn:brain_owner', 'con:connections_owner', 'reg:registry_owner'])
  await assertSignatures(client, 'MIGRATION_011_CATALOG_REFUSED', `
    SELECT schemaname || '.' || tablename || ':' || tableowner AS signature
    FROM pg_tables
    WHERE schemaname IN ('brn', 'con', 'reg')
      OR (schemaname = 'project' AND tablename IN ('brain_binding', 'connection_binding'
        ${withR2Recovery ? ", 'binding_source_intent'" : ''}))
    ORDER BY schemaname, tablename
  `, [
    'brn.binding_validation:brain_owner',
    'brn.health:brain_owner',
    'con.connection:connections_owner',
    'con.connection_qualification:connections_owner',
    'con.connection_revision:connections_owner',
    'con.operation_receipt:connections_owner',
    ...(withR2Recovery ? ['project.binding_source_intent:project_owner'] : []),
    'project.brain_binding:project_owner',
    'project.connection_binding:project_owner',
    'reg.artifact:registry_owner',
    'reg.artifact_revision:registry_owner',
  ])
  await assertSignatures(client, 'MIGRATION_011_RLS_REFUSED', `
    SELECT n.nspname || '.' || c.relname || ':' || c.relrowsecurity || ':' || c.relforcerowsecurity AS signature
    FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con') AND c.relkind IN ('r', 'p')
      AND (c.relrowsecurity OR c.relforcerowsecurity)
    ORDER BY n.nspname, c.relname
  `, [])
  await assertSignatures(client, 'MIGRATION_011_TRIGGER_RULE_REFUSED', `
    SELECT n.nspname || '.' || c.relname || ':' || trigger_row.tgname || ':' ||
      function_namespace.nspname || '.' || function_row.proname || ':' || pg_get_triggerdef(trigger_row.oid, true) AS signature
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS c ON c.oid = trigger_row.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_proc AS function_row ON function_row.oid = trigger_row.tgfoid
    JOIN pg_namespace AS function_namespace ON function_namespace.oid = function_row.pronamespace
    WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con') AND NOT trigger_row.tgisinternal
    ORDER BY n.nspname, c.relname, trigger_row.tgname
  `, withR2Recovery ? [
    'project.inception_idempotency:inception_binding_source_guard:project.guard_inception_binding_source:CREATE TRIGGER inception_binding_source_guard BEFORE INSERT ON project.inception_idempotency FOR EACH ROW EXECUTE FUNCTION project.guard_inception_binding_source()'
  ] : [])
  await assertSignatures(client, 'MIGRATION_011_TRIGGER_RULE_REFUSED', `
    SELECT n.nspname || '.' || c.relname || ':' || trigger_row.tgname || ':' || trigger_row.tgenabled::text AS signature
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS c ON c.oid = trigger_row.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
      AND trigger_row.tgenabled <> 'O'
    ORDER BY n.nspname, c.relname, trigger_row.tgname
  `, [])
  await assertSignatures(client, 'MIGRATION_011_TRIGGER_RULE_REFUSED', `
    SELECT schemaname || '.' || tablename || ':' || rulename || ':' || definition AS signature
    FROM pg_rules
    WHERE schemaname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
    ORDER BY schemaname, tablename, rulename
  `, [])
  await assertSignatures(client, 'MIGRATION_011_RLS_REFUSED', `
    SELECT schemaname || '.' || tablename || ':' || policyname AS signature
    FROM pg_policies
    WHERE schemaname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
    ORDER BY schemaname, tablename, policyname
  `, [])
  await assertSignatures(client, 'MIGRATION_011_CATALOG_REFUSED', `
    SELECT table_schema || '.' || table_name || ':' || column_name || ':' || udt_name || ':' || is_nullable || ':' ||
      coalesce(column_default, '') AS signature
    FROM information_schema.columns
    WHERE (table_schema = 'iam' AND table_name IN ('workspace_membership', 'account_project_grant')
      AND column_name IN ('can_read_brain', 'can_read_connection', 'can_manage_connection', 'can_qualify_connection', 'can_bind_brain', 'can_use_connection'))
      OR (table_schema = 'reg' AND table_name = 'artifact' AND column_name = 'published_revision_id')
    ORDER BY table_schema, table_name, ordinal_position
  `, [
    'iam.account_project_grant:can_read_connection:bool:NO:false',
    'iam.account_project_grant:can_manage_connection:bool:NO:false',
    'iam.account_project_grant:can_qualify_connection:bool:NO:false',
    'iam.account_project_grant:can_bind_brain:bool:NO:false',
    'iam.account_project_grant:can_use_connection:bool:NO:false',
    'iam.workspace_membership:can_read_brain:bool:NO:false',
    'iam.workspace_membership:can_read_connection:bool:NO:false',
    'iam.workspace_membership:can_manage_connection:bool:NO:false',
    'iam.workspace_membership:can_qualify_connection:bool:NO:false',
    'reg.artifact:published_revision_id:uuid:YES:',
  ])
  await assertSignatures(client, 'MIGRATION_011_CATALOG_REFUSED', `
    SELECT table_schema || '.' || table_name || ':' || column_name || ':' || udt_name || ':' || is_nullable || ':' ||
      coalesce(column_default, '') AS signature
    FROM information_schema.columns
    WHERE (table_schema, table_name) IN (('brn', 'health'), ('reg', 'artifact'), ('reg', 'artifact_revision'))
    ORDER BY table_schema, table_name, ordinal_position
  `, [
    'brn.health:health_snapshot_digest:text:NO:',
    'brn.health:brain_revision_id:uuid:NO:',
    'brn.health:brain_digest:text:NO:',
    'brn.health:items:jsonb:NO:',
    'brn.health:checked_at:timestamptz:NO:clock_timestamp()',
    'reg.artifact:artifact_id:uuid:NO:',
    'reg.artifact:workspace_id:uuid:NO:',
    'reg.artifact:kind:text:NO:',
    'reg.artifact:semantic_name:text:NO:',
    'reg.artifact:published_revision_id:uuid:YES:',
    'reg.artifact:created_at:timestamptz:NO:clock_timestamp()',
    'reg.artifact_revision:artifact_revision_id:uuid:NO:',
    'reg.artifact_revision:artifact_id:uuid:NO:',
    'reg.artifact_revision:source_revision:text:NO:',
    'reg.artifact_revision:digest:text:NO:',
    'reg.artifact_revision:payload:jsonb:NO:',
    'reg.artifact_revision:availability:text:NO:',
    'reg.artifact_revision:created_at:timestamptz:NO:clock_timestamp()',
  ])
  await assertSignatures(client, 'MIGRATION_011_CONNECTION_CATALOG_REFUSED', `
    SELECT table_name || ':' || column_name || ':' || udt_name || ':' || is_nullable || ':' ||
      coalesce(column_default, '') AS signature
    FROM information_schema.columns
    WHERE table_schema = 'con'
    ORDER BY table_name, ordinal_position
  `, [
    'connection:connection_id:uuid:NO:',
    'connection:owner_scope_kind:text:NO:',
    'connection:workspace_id:uuid:YES:',
    'connection:project_id:uuid:YES:',
    'connection:name:text:NO:',
    'connection:current_revision_id:uuid:YES:',
    'connection:credential_generation:int8:YES:',
    'connection:credential_generation_high_watermark:int8:NO:0',
    'connection:created_at:timestamptz:NO:clock_timestamp()',
    'connection:updated_at:timestamptz:NO:clock_timestamp()',
    'connection_qualification:qualification_id:uuid:NO:',
    'connection_qualification:connection_id:uuid:NO:',
    'connection_qualification:connection_revision_id:uuid:NO:',
    'connection_qualification:credential_generation:int8:YES:',
    'connection_qualification:environment:text:NO:',
    'connection_qualification:qualification_state:text:YES:',
    'connection_qualification:outcome:text:YES:',
    'connection_qualification:diagnostic:jsonb:YES:',
    'connection_qualification:evidence_refs:_text:YES:',
    'connection_qualification:tested_at:timestamptz:YES:',
    'connection_qualification:created_at:timestamptz:NO:clock_timestamp()',
    'connection_revision:connection_revision_id:uuid:NO:',
    'connection_revision:connection_id:uuid:NO:',
    'connection_revision:connector_definition_id:text:NO:',
    'connection_revision:connector_version:text:NO:',
    'connection_revision:configuration:jsonb:NO:',
    'connection_revision:configuration_digest:text:NO:',
    'connection_revision:created_at:timestamptz:NO:clock_timestamp()',
    'operation_receipt:operation_id:text:NO:',
    'operation_receipt:account_id:uuid:NO:',
    'operation_receipt:subject_id:uuid:NO:',
    'operation_receipt:key_digest:text:NO:',
    'operation_receipt:request_digest:text:NO:',
    'operation_receipt:reserved_connection_id:uuid:NO:',
    'operation_receipt:reserved_revision_id:uuid:YES:',
    'operation_receipt:reserved_generation:int8:YES:',
    'operation_receipt:reserved_qualification_id:uuid:YES:',
    'operation_receipt:reservation_owner:uuid:YES:',
    'operation_receipt:lease_expires_at:timestamptz:YES:',
    'operation_receipt:settlement_state:text:NO:',
    'operation_receipt:created_at:timestamptz:NO:clock_timestamp()',
    'operation_receipt:completed_at:timestamptz:YES:',
  ])
  await assertSignatures(client, 'MIGRATION_011_CONNECTION_CATALOG_REFUSED', `
    SELECT c.relname || ':' || constraint_row.conname || ':' || constraint_row.contype::text || ':' ||
      pg_get_constraintdef(constraint_row.oid, true) AS signature
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS c ON c.oid = constraint_row.conrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'con'
    ORDER BY c.relname, constraint_row.conname
  `, [
    `connection:connection_check:c:CHECK (credential_generation IS NULL OR credential_generation <= credential_generation_high_watermark)`,
    `connection:connection_check1:c:CHECK (owner_scope_kind = 'WORKSPACE'::text AND workspace_id IS NOT NULL AND project_id IS NULL OR owner_scope_kind = 'PROJECT'::text AND workspace_id IS NULL AND project_id IS NOT NULL)`,
    'connection:connection_credential_generation_check:c:CHECK (credential_generation > 0)',
    'connection:connection_credential_generation_high_watermark_check:c:CHECK (credential_generation_high_watermark >= 0)',
    'connection:connection_current_revision_fkey:f:FOREIGN KEY (connection_id, current_revision_id) REFERENCES con.connection_revision(connection_id, connection_revision_id) ON DELETE RESTRICT',
    `connection:connection_name_check:c:CHECK (name ~ '\\S'::text)`,
    `connection:connection_owner_scope_kind_check:c:CHECK (owner_scope_kind = ANY (ARRAY['WORKSPACE'::text, 'PROJECT'::text]))`,
    'connection:connection_pkey:p:PRIMARY KEY (connection_id)',
    'connection:connection_project_id_fkey:f:FOREIGN KEY (project_id) REFERENCES project.project(project_id) ON DELETE RESTRICT',
    'connection:connection_workspace_id_fkey:f:FOREIGN KEY (workspace_id) REFERENCES workspace.workspace(workspace_id) ON DELETE RESTRICT',
    'connection_qualification:connection_qualification_check:c:CHECK (qualification_state IS NULL AND outcome IS NULL AND diagnostic IS NULL AND evidence_refs IS NULL AND tested_at IS NULL OR qualification_state IS NOT NULL AND outcome IS NOT NULL AND diagnostic IS NOT NULL AND evidence_refs IS NOT NULL AND cardinality(evidence_refs) > 0 AND tested_at IS NOT NULL)',
    'connection_qualification:connection_qualification_connection_id_connection_revision_fkey:f:FOREIGN KEY (connection_id, connection_revision_id) REFERENCES con.connection_revision(connection_id, connection_revision_id) ON DELETE RESTRICT',
    'connection_qualification:connection_qualification_connection_id_qualification_id_key:u:UNIQUE (connection_id, qualification_id)',
    'connection_qualification:connection_qualification_credential_generation_check:c:CHECK (credential_generation > 0)',
    `connection_qualification:connection_qualification_environment_check:c:CHECK (environment = ANY (ARRAY['SANDBOX'::text, 'PRODUCTION'::text]))`,
    `connection_qualification:connection_qualification_outcome_check:c:CHECK (outcome = ANY (ARRAY['PASSED'::text, 'FAILED'::text, 'INDETERMINATE'::text]))`,
    'connection_qualification:connection_qualification_pkey:p:PRIMARY KEY (qualification_id)',
    `connection_qualification:connection_qualification_qualification_state_check:c:CHECK (qualification_state ~ '\\S'::text)`,
    `connection_revision:connection_revision_configuration_check:c:CHECK (jsonb_typeof(configuration) = 'object'::text)`,
    `connection_revision:connection_revision_configuration_digest_check:c:CHECK (configuration_digest ~ '^[a-f0-9]{64}$'::text)`,
    'connection_revision:connection_revision_connection_id_connection_revision_id_key:u:UNIQUE (connection_id, connection_revision_id)',
    'connection_revision:connection_revision_connection_id_fkey:f:FOREIGN KEY (connection_id) REFERENCES con.connection(connection_id) ON DELETE RESTRICT',
    `connection_revision:connection_revision_connector_definition_id_check:c:CHECK (connector_definition_id ~ '\\S'::text)`,
    `connection_revision:connection_revision_connector_version_check:c:CHECK (connector_version ~ '\\S'::text)`,
    'connection_revision:connection_revision_pkey:p:PRIMARY KEY (connection_revision_id)',
    `operation_receipt:operation_receipt_check:c:CHECK (operation_id = 'CON-05'::text AND reserved_revision_id IS NOT NULL AND reserved_generation IS NULL AND reserved_qualification_id IS NULL AND reservation_owner IS NULL AND lease_expires_at IS NULL AND settlement_state = 'SETTLED'::text AND completed_at IS NOT NULL OR operation_id = 'CON-07'::text AND subject_id = reserved_connection_id AND reserved_revision_id IS NULL AND reserved_generation IS NOT NULL AND reserved_qualification_id IS NULL AND reservation_owner IS NULL AND lease_expires_at IS NULL OR operation_id = 'CON-08'::text AND subject_id = reserved_connection_id AND reserved_revision_id IS NOT NULL AND reserved_generation IS NOT NULL AND reserved_qualification_id IS NOT NULL AND reservation_owner IS NOT NULL AND lease_expires_at IS NOT NULL)`,
    `operation_receipt:operation_receipt_check1:c:CHECK (settlement_state = 'RESERVED'::text AND completed_at IS NULL OR (settlement_state = ANY (ARRAY['SETTLED'::text, 'ABANDONED'::text])) AND completed_at IS NOT NULL)`,
    `operation_receipt:operation_receipt_check2:c:CHECK (settlement_state <> 'ABANDONED'::text OR operation_id = 'CON-07'::text)`,
    `operation_receipt:operation_receipt_key_digest_check:c:CHECK (key_digest ~ '^[a-f0-9]{64}$'::text)`,
    `operation_receipt:operation_receipt_operation_id_check:c:CHECK (operation_id = ANY (ARRAY['CON-05'::text, 'CON-07'::text, 'CON-08'::text]))`,
    'operation_receipt:operation_receipt_pkey:p:PRIMARY KEY (operation_id, account_id, subject_id, key_digest)',
    `operation_receipt:operation_receipt_request_digest_check:c:CHECK (request_digest ~ '^[a-f0-9]{64}$'::text)`,
    'operation_receipt:operation_receipt_reserved_generation_check:c:CHECK (reserved_generation > 0)',
    `operation_receipt:operation_receipt_settlement_state_check:c:CHECK (settlement_state = ANY (ARRAY['RESERVED'::text, 'SETTLED'::text, 'ABANDONED'::text]))`,
  ])
  await assertSignatures(client, 'MIGRATION_011_CONNECTION_CATALOG_REFUSED', `
    SELECT tablename || ':' || indexname || ':' || indexdef AS signature
    FROM pg_indexes WHERE schemaname = 'con'
    ORDER BY tablename, indexname
  `, [
    'connection:connection_pkey:CREATE UNIQUE INDEX connection_pkey ON con.connection USING btree (connection_id)',
    'connection_qualification:connection_qualification_connection_id_qualification_id_key:CREATE UNIQUE INDEX connection_qualification_connection_id_qualification_id_key ON con.connection_qualification USING btree (connection_id, qualification_id)',
    'connection_qualification:connection_qualification_pkey:CREATE UNIQUE INDEX connection_qualification_pkey ON con.connection_qualification USING btree (qualification_id)',
    'connection_revision:connection_revision_connection_id_connection_revision_id_key:CREATE UNIQUE INDEX connection_revision_connection_id_connection_revision_id_key ON con.connection_revision USING btree (connection_id, connection_revision_id)',
    'connection_revision:connection_revision_pkey:CREATE UNIQUE INDEX connection_revision_pkey ON con.connection_revision USING btree (connection_revision_id)',
    'operation_receipt:operation_receipt_pkey:CREATE UNIQUE INDEX operation_receipt_pkey ON con.operation_receipt USING btree (operation_id, account_id, subject_id, key_digest)',
    `operation_receipt:operation_receipt_reserved_connection_id_key:CREATE UNIQUE INDEX operation_receipt_reserved_connection_id_key ON con.operation_receipt USING btree (reserved_connection_id) WHERE (operation_id = 'CON-05'::text)`,
    `operation_receipt:operation_receipt_reserved_qualification_id_key:CREATE UNIQUE INDEX operation_receipt_reserved_qualification_id_key ON con.operation_receipt USING btree (reserved_qualification_id) WHERE (operation_id = 'CON-08'::text)`,
    `operation_receipt:operation_receipt_reserved_revision_id_key:CREATE UNIQUE INDEX operation_receipt_reserved_revision_id_key ON con.operation_receipt USING btree (reserved_revision_id) WHERE (operation_id = 'CON-05'::text)`,
  ])
  await assertSignatures(client, 'MIGRATION_011_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || c.relname || ':' || constraint_row.conname || ':' || constraint_row.contype::text || ':' ||
      pg_get_constraintdef(constraint_row.oid, true) AS signature
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS c ON c.oid = constraint_row.conrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE (n.nspname, c.relname) IN (('brn', 'health'), ('reg', 'artifact'), ('reg', 'artifact_revision'))
    ORDER BY n.nspname, c.relname, constraint_row.conname
  `, [
    `brn.health:health_brain_digest_check:c:CHECK (brain_digest ~ '^[a-f0-9]{64}$'::text)`,
    `brn.health:health_health_snapshot_digest_check:c:CHECK (health_snapshot_digest ~ '^[a-f0-9]{64}$'::text)`,
    `brn.health:health_items_check:c:CHECK (jsonb_typeof(items) = 'array'::text)`,
    'brn.health:health_pkey:p:PRIMARY KEY (health_snapshot_digest)',
    `reg.artifact:artifact_kind_check:c:CHECK (kind = 'brain'::text)`,
    'reg.artifact:artifact_pkey:p:PRIMARY KEY (artifact_id)',
    'reg.artifact:artifact_published_revision_fkey:f:FOREIGN KEY (artifact_id, published_revision_id) REFERENCES reg.artifact_revision(artifact_id, artifact_revision_id) ON DELETE RESTRICT',
    `reg.artifact:artifact_semantic_name_check:c:CHECK (semantic_name ~ '\\S'::text)`,
    'reg.artifact:artifact_workspace_id_fkey:f:FOREIGN KEY (workspace_id) REFERENCES workspace.workspace(workspace_id) ON DELETE RESTRICT',
    'reg.artifact:artifact_workspace_id_kind_key:u:UNIQUE (workspace_id, kind)',
    'reg.artifact_revision:artifact_revision_artifact_id_artifact_revision_id_key:u:UNIQUE (artifact_id, artifact_revision_id)',
    'reg.artifact_revision:artifact_revision_artifact_id_digest_key:u:UNIQUE (artifact_id, digest)',
    'reg.artifact_revision:artifact_revision_artifact_id_fkey:f:FOREIGN KEY (artifact_id) REFERENCES reg.artifact(artifact_id) ON DELETE RESTRICT',
    'reg.artifact_revision:artifact_revision_artifact_id_source_revision_key:u:UNIQUE (artifact_id, source_revision)',
    `reg.artifact_revision:artifact_revision_availability_check:c:CHECK (availability = 'AVAILABLE'::text)`,
    `reg.artifact_revision:artifact_revision_digest_check:c:CHECK (digest ~ '^[a-f0-9]{64}$'::text)`,
    `reg.artifact_revision:artifact_revision_payload_check:c:CHECK (jsonb_typeof(payload) = 'object'::text)`,
    'reg.artifact_revision:artifact_revision_pkey:p:PRIMARY KEY (artifact_revision_id)',
    `reg.artifact_revision:artifact_revision_source_revision_check:c:CHECK (source_revision ~ '\\S'::text)`,
  ])
  await assertSignatures(client, 'MIGRATION_011_CATALOG_REFUSED', `
    SELECT schemaname || '.' || tablename || ':' || indexname || ':' || indexdef AS signature
    FROM pg_indexes
    WHERE (schemaname, tablename) IN (('brn', 'health'), ('reg', 'artifact'), ('reg', 'artifact_revision'))
    ORDER BY schemaname, tablename, indexname
  `, [
    'brn.health:health_pkey:CREATE UNIQUE INDEX health_pkey ON brn.health USING btree (health_snapshot_digest)',
    'reg.artifact:artifact_pkey:CREATE UNIQUE INDEX artifact_pkey ON reg.artifact USING btree (artifact_id)',
    'reg.artifact:artifact_workspace_id_kind_key:CREATE UNIQUE INDEX artifact_workspace_id_kind_key ON reg.artifact USING btree (workspace_id, kind)',
    'reg.artifact_revision:artifact_revision_artifact_id_artifact_revision_id_key:CREATE UNIQUE INDEX artifact_revision_artifact_id_artifact_revision_id_key ON reg.artifact_revision USING btree (artifact_id, artifact_revision_id)',
    'reg.artifact_revision:artifact_revision_artifact_id_digest_key:CREATE UNIQUE INDEX artifact_revision_artifact_id_digest_key ON reg.artifact_revision USING btree (artifact_id, digest)',
    'reg.artifact_revision:artifact_revision_artifact_id_source_revision_key:CREATE UNIQUE INDEX artifact_revision_artifact_id_source_revision_key ON reg.artifact_revision USING btree (artifact_id, source_revision)',
    'reg.artifact_revision:artifact_revision_pkey:CREATE UNIQUE INDEX artifact_revision_pkey ON reg.artifact_revision USING btree (artifact_revision_id)',
  ])
  await assertSignatures(client, 'MIGRATION_011_CATALOG_REFUSED', `
    SELECT source_namespace.nspname || '.' || source_relation.relname || '.' || constraint_row.conname || ':' ||
      pg_get_constraintdef(constraint_row.oid, true) AS signature
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS source_relation ON source_relation.oid = constraint_row.conrelid
    JOIN pg_namespace AS source_namespace ON source_namespace.oid = source_relation.relnamespace
    WHERE source_namespace.nspname = 'reg' AND source_relation.relname = 'artifact'
      AND constraint_row.conname = 'artifact_published_revision_fkey'
  `, [
    'reg.artifact.artifact_published_revision_fkey:FOREIGN KEY (artifact_id, published_revision_id) REFERENCES reg.artifact_revision(artifact_id, artifact_revision_id) ON DELETE RESTRICT',
  ])
  await assertSignatures(client, 'MIGRATION_011_CATALOG_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' ||
      l.lanname || ':' || p.provolatile::text || ':' || pg_get_userbyid(p.proowner) || ':' || p.prosecdef || ':' ||
      array_to_string(p.proconfig, ',') || ':' ||
      pg_get_function_result(p.oid) AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace JOIN pg_language AS l ON l.oid = p.prolang
    WHERE (n.nspname, p.proname) IN (
      ('iam', 'establish_workspace_creator_access'), ('iam', 'establish_project_creator_grant'),
      ('iam', 'admit_any_connection_read'), ('iam', 'admit_connection_read'),
      ('iam', 'admit_connection_manage'), ('iam', 'admit_connection_qualify'),
      ('iam', 'admit_brain_read'), ('iam', 'admit_connection_selection'),
      ('reg', 'bootstrap_workspace_brain'), ('reg', 'get_workspace_brain'),
      ('reg', 'list_brain_revisions'), ('reg', 'get_brain_revision'),
      ('brn', 'bootstrap_brain_health'), ('brn', 'get_brain_health'),
      ('con', 'admit_project_binding_revision'), ('con', 'create_or_replay_connection'),
      ('con', 'get_connection'), ('con', 'get_connection_qualification'), ('con', 'get_project_binding_name'),
      ('con', 'list_connections'),
      ('con', 'reserve_connection_credential'), ('con', 'reserve_connection_qualification'),
      ('con', 'revise_connection'), ('con', 'settle_connection_credential'),
      ('con', 'settle_connection_qualification'),
      ('project', 'list_connection_bindings'), ('project', 'prepare_connection_binding'),
      ('project', 'settle_connection_binding')
      ${withR2Concordance ? ", ('project', 'get_binding_source_basis')" : ''}
    )
    ORDER BY n.nspname, p.proname
  `, [
    'brn.bootstrap_brain_health(text, uuid, text, jsonb):plpgsql:v:brain_owner:true:search_path=pg_catalog, pg_temp:void',
    'brn.get_brain_health(uuid, text):sql:s:brain_owner:true:search_path=pg_catalog, pg_temp:TABLE(brain_revision_id uuid, brain_digest text, health_snapshot_digest text, items jsonb)',
    'con.admit_project_binding_revision(uuid, uuid, uuid, uuid, text):plpgsql:v:connections_owner:true:search_path=pg_catalog, pg_temp:TABLE(qualification_id uuid, connection_name text)',
    'con.create_or_replay_connection(uuid, text, uuid, text, text, uuid, uuid, text, text, text, jsonb, text):plpgsql:v:connections_owner:true:search_path=pg_catalog, pg_temp:TABLE(connection_id uuid, connection_revision_id uuid, replayed boolean)',
    'con.get_connection(uuid, uuid):plpgsql:s:connections_owner:true:search_path=pg_catalog, pg_temp:TABLE(connection_id uuid, name text, owner_scope_kind text, owner_id uuid, connector_definition_id text, connector_version text, current_revision_id uuid, credential_configured boolean, configuration jsonb, test_state text, qualification_id uuid, test_environment text, tested_at timestamp with time zone)',
    'con.get_connection_qualification(uuid, uuid, uuid):plpgsql:s:connections_owner:true:search_path=pg_catalog, pg_temp:TABLE(qualification_id uuid, connection_id uuid, connection_revision_id uuid, credential_generation bigint, environment text, qualification_state text, outcome text, tested_at timestamp with time zone, diagnostic jsonb, evidence_refs text[])',
    'con.get_project_binding_name(uuid, uuid, uuid):plpgsql:s:connections_owner:true:search_path=pg_catalog, pg_temp:text',
    'con.list_connections(uuid, text, uuid, uuid):plpgsql:s:connections_owner:true:search_path=pg_catalog, pg_temp:TABLE(connection_id uuid, name text, owner_scope_kind text, owner_id uuid, connector_definition_id text, connector_version text, current_revision_id uuid, credential_configured boolean, test_state text, qualification_id uuid, test_environment text, tested_at timestamp with time zone)',
    'con.reserve_connection_credential(uuid, uuid, text, text):plpgsql:v:connections_owner:true:search_path=pg_catalog, pg_temp:TABLE(credential_generation bigint, settlement_state text)',
    'con.reserve_connection_qualification(uuid, uuid, uuid, text, text, text, uuid, uuid):plpgsql:v:connections_owner:true:search_path=pg_catalog, pg_temp:TABLE(qualification_id uuid, connection_revision_id uuid, credential_generation bigint, environment text, configuration jsonb, settlement_state text, qualification_state text, outcome text, diagnostic jsonb, evidence_refs text[], tested_at timestamp with time zone)',
    'con.revise_connection(uuid, uuid, uuid, uuid, jsonb, text):plpgsql:v:connections_owner:true:search_path=pg_catalog, pg_temp:TABLE(connection_id uuid, connection_revision_id uuid, connector_definition_id text, connector_version text)',
    'con.settle_connection_credential(uuid, uuid, text, text, bigint):plpgsql:v:connections_owner:true:search_path=pg_catalog, pg_temp:void',
    'con.settle_connection_qualification(uuid, uuid, uuid, uuid, bigint, text, uuid, text, text, jsonb, text[], timestamp with time zone):plpgsql:v:connections_owner:true:search_path=pg_catalog, pg_temp:void',
    'iam.admit_any_connection_read(uuid):sql:s:iam_owner:true:search_path=pg_catalog, pg_temp:boolean',
    'iam.admit_brain_read(uuid, uuid):sql:s:iam_owner:true:search_path=pg_catalog, pg_temp:TABLE(workspace_id uuid, can_read_brain boolean)',
    'iam.admit_connection_manage(uuid, text, uuid):sql:v:iam_owner:true:search_path=pg_catalog, pg_temp:TABLE(scope_exists boolean, permitted boolean)',
    'iam.admit_connection_qualify(uuid, text, uuid):sql:v:iam_owner:true:search_path=pg_catalog, pg_temp:TABLE(scope_exists boolean, permitted boolean)',
    'iam.admit_connection_read(uuid, text, uuid):sql:s:iam_owner:true:search_path=pg_catalog, pg_temp:TABLE(scope_exists boolean, permitted boolean)',
    'iam.admit_connection_selection(uuid, uuid, text, uuid):sql:s:iam_owner:true:search_path=pg_catalog, pg_temp:TABLE(project_id uuid, workspace_id uuid, scope_exists boolean, permitted boolean)',
    'iam.establish_project_creator_grant(uuid, uuid, text, text, uuid):plpgsql:v:iam_owner:true:search_path=pg_catalog, pg_temp:void',
    'iam.establish_workspace_creator_access(uuid, uuid):sql:v:iam_owner:true:search_path=pg_catalog, pg_temp:void',
    ...(withR2Concordance ? ['project.get_binding_source_basis(uuid, uuid, uuid, bigint):plpgsql:v:project_owner:true:search_path=pg_catalog, pg_temp:jsonb'] : []),
    'project.list_connection_bindings(uuid, uuid):plpgsql:v:project_owner:true:search_path=pg_catalog, pg_temp:TABLE(connection_id uuid, connection_revision_id uuid, environment text, connection_name text)',
    'project.prepare_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean):plpgsql:v:project_owner:true:search_path=pg_catalog, pg_temp:TABLE(source_revision text, declaration jsonb, result jsonb)',
    'project.settle_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean, text, text, jsonb, text):plpgsql:v:project_owner:true:search_path=pg_catalog, pg_temp:jsonb',
    'reg.bootstrap_workspace_brain(uuid, uuid, uuid, text, text, jsonb):plpgsql:v:registry_owner:true:search_path=pg_catalog, pg_temp:void',
    'reg.get_brain_revision(uuid, uuid, uuid[]):sql:s:registry_owner:true:search_path=pg_catalog, pg_temp:TABLE(brain_revision_id uuid, brain_digest text, source_revision text, availability text, payload jsonb)',
    'reg.get_workspace_brain(uuid, uuid[]):sql:s:registry_owner:true:search_path=pg_catalog, pg_temp:TABLE(workspace_id uuid, published_brain_revision_id uuid)',
    'reg.list_brain_revisions(uuid, uuid[]):sql:s:registry_owner:true:search_path=pg_catalog, pg_temp:TABLE(brain_revision_id uuid, brain_digest text, source_revision text, availability text, payload jsonb, created_at timestamp with time zone)',
  ])
  const functionBodies = (await client.query(`
    SELECT n.nspname || '.' || p.proname AS name, p.prosrc AS definition
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('iam', 'establish_workspace_creator_access'), ('iam', 'establish_project_creator_grant'),
      ('iam', 'admit_any_connection_read'), ('iam', 'admit_connection_read'),
      ('iam', 'admit_connection_manage'), ('iam', 'admit_connection_qualify'),
      ('iam', 'admit_brain_read'), ('iam', 'admit_connection_selection'),
      ('reg', 'bootstrap_workspace_brain'), ('reg', 'get_workspace_brain'),
      ('reg', 'list_brain_revisions'), ('reg', 'get_brain_revision'),
      ('brn', 'bootstrap_brain_health'), ('brn', 'get_brain_health'),
      ('con', 'admit_project_binding_revision'), ('con', 'create_or_replay_connection'),
      ('con', 'get_connection'), ('con', 'get_connection_qualification'), ('con', 'get_project_binding_name'),
      ('con', 'list_connections'),
      ('con', 'reserve_connection_credential'), ('con', 'reserve_connection_qualification'),
      ('con', 'revise_connection'), ('con', 'settle_connection_credential'),
      ('con', 'settle_connection_qualification'),
      ('project', 'list_connection_bindings'), ('project', 'prepare_connection_binding'),
      ('project', 'settle_connection_binding')
    )
    ORDER BY name
  `)).rows
  if (JSON.stringify(functionBodies) !== JSON.stringify(expected011FunctionBodies(migration011))) {
    fail('MIGRATION_011_FUNCTION_SOURCE_REFUSED')
  }
  if (after014) return
  await assertSignatures(client, 'MIGRATION_011_FUNCTION_CENSUS_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' ||
      pg_get_userbyid(p.proowner) || ':' || p.prosecdef AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('brn', 'con', 'reg')
      OR (n.nspname = 'project' AND p.proname IN (
        'list_connection_bindings', 'prepare_connection_binding', 'settle_connection_binding'
        ${withR2Recovery ? ", 'abort_binding_source_intent', 'begin_connection_binding_intent', 'complete_binding_source_abort', 'complete_binding_source_intent', 'freeze_binding_source_intent', 'get_binding_source_intent', 'guard_inception_binding_source', 'lock_binding_project', 'validate_binding_source_intent'" : ''}
        ${withR2Concordance ? ", 'get_binding_source_basis'" : ''}
      ))
    ORDER BY n.nspname, p.proname, oidvectortypes(p.proargtypes)
  `, [
    'brn.bootstrap_brain_health(text, uuid, text, jsonb):brain_owner:true',
    'brn.get_brain_health(uuid, text):brain_owner:true',
    'con.admit_project_binding_revision(uuid, uuid, uuid, uuid, text):connections_owner:true',
    'con.create_or_replay_connection(uuid, text, uuid, text, text, uuid, uuid, text, text, text, jsonb, text):connections_owner:true',
    'con.get_connection(uuid, uuid):connections_owner:true',
    'con.get_connection_qualification(uuid, uuid, uuid):connections_owner:true',
    'con.get_project_binding_name(uuid, uuid, uuid):connections_owner:true',
    'con.list_connections(uuid, text, uuid, uuid):connections_owner:true',
    'con.reserve_connection_credential(uuid, uuid, text, text):connections_owner:true',
    'con.reserve_connection_qualification(uuid, uuid, uuid, text, text, text, uuid, uuid):connections_owner:true',
    'con.revise_connection(uuid, uuid, uuid, uuid, jsonb, text):connections_owner:true',
    'con.settle_connection_credential(uuid, uuid, text, text, bigint):connections_owner:true',
    'con.settle_connection_qualification(uuid, uuid, uuid, uuid, bigint, text, uuid, text, text, jsonb, text[], timestamp with time zone):connections_owner:true',
    ...(withR2Recovery ? [
      'project.abort_binding_source_intent(uuid, uuid, uuid, bigint, text):project_owner:true',
      'project.begin_connection_binding_intent(uuid, uuid, uuid, uuid, text, jsonb, boolean, uuid):project_owner:true',
      'project.complete_binding_source_abort(uuid, uuid, uuid, bigint, text):project_owner:true',
      'project.complete_binding_source_intent(uuid, uuid, uuid, bigint):project_owner:true',
      'project.freeze_binding_source_intent(uuid, uuid, uuid, bigint, text, text, text, text, text, text):project_owner:true',
      ...(withR2Concordance ? ['project.get_binding_source_basis(uuid, uuid, uuid, bigint):project_owner:true'] : []),
      'project.get_binding_source_intent(uuid, uuid, uuid):project_owner:true',
      'project.guard_inception_binding_source():project_owner:true',
    ] : []),
    'project.list_connection_bindings(uuid, uuid):project_owner:true',
    ...(withR2Recovery ? ['project.lock_binding_project(uuid, uuid):project_owner:true'] : []),
    'project.prepare_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean):project_owner:true',
    'project.settle_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean, text, text, jsonb, text):project_owner:true',
    ...(withR2Recovery ? ['project.validate_binding_source_intent(uuid, uuid, uuid, bigint):project_owner:true'] : []),
    'reg.bootstrap_workspace_brain(uuid, uuid, uuid, text, text, jsonb):registry_owner:true',
    'reg.get_brain_revision(uuid, uuid, uuid[]):registry_owner:true',
    'reg.get_workspace_brain(uuid, uuid[]):registry_owner:true',
    'reg.list_brain_revisions(uuid, uuid[]):registry_owner:true',
  ])
  await assertSignatures(client, 'MIGRATION_011_EXECUTE_PRIVILEGE_REFUSED', `
    WITH roles(role_name) AS (
      SELECT rolname FROM pg_roles WHERE rolname LIKE 'hub\\_%' ESCAPE '\\'
      UNION ALL SELECT role_name FROM (VALUES
        ('brain_owner'), ('connections_owner'), ('iam_owner'), ('project_owner'),
        ('registry_owner'), ('workspace_owner'), ('public')
      ) AS owner_roles(role_name)
    )
    SELECT roles.role_name || ':' || n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature
    FROM roles CROSS JOIN pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('iam', 'admit_brain_read'),
      ('reg', 'bootstrap_workspace_brain'), ('reg', 'get_workspace_brain'),
      ('reg', 'list_brain_revisions'), ('reg', 'get_brain_revision'),
      ('brn', 'bootstrap_brain_health'), ('brn', 'get_brain_health')
    ) AND has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
    ORDER BY roles.role_name, n.nspname, p.proname
  `, [
    'brain_owner:brn.bootstrap_brain_health(text, uuid, text, jsonb)',
    'brain_owner:brn.get_brain_health(uuid, text)',
    'hub_r2_brain_bootstrap:brn.bootstrap_brain_health(text, uuid, text, jsonb)',
    'hub_r2_brain_bootstrap:reg.bootstrap_workspace_brain(uuid, uuid, uuid, text, text, jsonb)',
    'hub_r2_brain_read:brn.get_brain_health(uuid, text)',
    'hub_r2_brain_read:iam.admit_brain_read(uuid, uuid)',
    'hub_r2_brain_read:reg.get_brain_revision(uuid, uuid, uuid[])',
    'hub_r2_brain_read:reg.get_workspace_brain(uuid, uuid[])',
    'hub_r2_brain_read:reg.list_brain_revisions(uuid, uuid[])',
    'iam_owner:iam.admit_brain_read(uuid, uuid)',
    'registry_owner:reg.bootstrap_workspace_brain(uuid, uuid, uuid, text, text, jsonb)',
    'registry_owner:reg.get_brain_revision(uuid, uuid, uuid[])',
    'registry_owner:reg.get_workspace_brain(uuid, uuid[])',
    'registry_owner:reg.list_brain_revisions(uuid, uuid[])',
  ])
  await assertSignatures(client, 'MIGRATION_011_CONNECTION_EXECUTE_PRIVILEGE_REFUSED', `
    WITH roles(role_name) AS (
      SELECT rolname FROM pg_roles WHERE rolname LIKE 'hub\\_%' ESCAPE '\\'
      UNION ALL SELECT role_name FROM (VALUES
        ('brain_owner'), ('connections_owner'), ('iam_owner'), ('project_owner'),
        ('registry_owner'), ('workspace_owner'), ('public')
      ) AS owner_roles(role_name)
    )
    SELECT roles.role_name || ':' || n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature
    FROM roles CROSS JOIN pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname = 'con' OR (n.nspname = 'project' AND p.proname IN (
      'list_connection_bindings', 'prepare_connection_binding', 'settle_connection_binding'
    )) OR (n.nspname = 'iam' AND p.proname IN (
      'establish_workspace_creator_access', 'establish_project_creator_grant',
      'admit_any_connection_read', 'admit_connection_read',
      'admit_connection_manage', 'admit_connection_qualify', 'admit_connection_selection'
    ))) AND has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
    ORDER BY roles.role_name, n.nspname, p.proname, oidvectortypes(p.proargtypes)
  `, [
    'connections_owner:con.admit_project_binding_revision(uuid, uuid, uuid, uuid, text)',
    'connections_owner:con.create_or_replay_connection(uuid, text, uuid, text, text, uuid, uuid, text, text, text, jsonb, text)',
    'connections_owner:con.get_connection(uuid, uuid)',
    'connections_owner:con.get_connection_qualification(uuid, uuid, uuid)',
    'connections_owner:con.get_project_binding_name(uuid, uuid, uuid)',
    'connections_owner:con.list_connections(uuid, text, uuid, uuid)',
    'connections_owner:con.reserve_connection_credential(uuid, uuid, text, text)',
    'connections_owner:con.reserve_connection_qualification(uuid, uuid, uuid, text, text, text, uuid, uuid)',
    'connections_owner:con.revise_connection(uuid, uuid, uuid, uuid, jsonb, text)',
    'connections_owner:con.settle_connection_credential(uuid, uuid, text, text, bigint)',
    'connections_owner:con.settle_connection_qualification(uuid, uuid, uuid, uuid, bigint, text, uuid, text, text, jsonb, text[], timestamp with time zone)',
    'connections_owner:iam.admit_connection_manage(uuid, text, uuid)',
    'connections_owner:iam.admit_connection_qualify(uuid, text, uuid)',
    'connections_owner:iam.admit_connection_read(uuid, text, uuid)',
    'connections_owner:iam.admit_connection_selection(uuid, uuid, text, uuid)',
    'hub_prj03_command:iam.establish_project_creator_grant(uuid, uuid, text, text, uuid)',
    'hub_r2_connections:con.create_or_replay_connection(uuid, text, uuid, text, text, uuid, uuid, text, text, text, jsonb, text)',
    'hub_r2_connections:con.get_connection(uuid, uuid)',
    'hub_r2_connections:con.get_connection_qualification(uuid, uuid, uuid)',
    'hub_r2_connections:con.list_connections(uuid, text, uuid, uuid)',
    'hub_r2_connections:con.reserve_connection_credential(uuid, uuid, text, text)',
    'hub_r2_connections:con.reserve_connection_qualification(uuid, uuid, uuid, text, text, text, uuid, uuid)',
    'hub_r2_connections:con.revise_connection(uuid, uuid, uuid, uuid, jsonb, text)',
    'hub_r2_connections:con.settle_connection_credential(uuid, uuid, text, text, bigint)',
    'hub_r2_connections:con.settle_connection_qualification(uuid, uuid, uuid, uuid, bigint, text, uuid, text, text, jsonb, text[], timestamp with time zone)',
    'hub_r2_connections:iam.admit_any_connection_read(uuid)',
    'hub_r2_project_binding:project.list_connection_bindings(uuid, uuid)',
    'hub_r2_project_binding:project.prepare_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean)',
    ...(!withR2Recovery ? [
      'hub_r2_project_binding:project.settle_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean, text, text, jsonb, text)',
    ] : []),
    'hub_ws01_command:iam.establish_workspace_creator_access(uuid, uuid)',
    'iam_owner:iam.admit_any_connection_read(uuid)',
    'iam_owner:iam.admit_connection_manage(uuid, text, uuid)',
    'iam_owner:iam.admit_connection_qualify(uuid, text, uuid)',
    'iam_owner:iam.admit_connection_read(uuid, text, uuid)',
    'iam_owner:iam.admit_connection_selection(uuid, uuid, text, uuid)',
    'iam_owner:iam.establish_project_creator_grant(uuid, uuid, text, text, uuid)',
    'iam_owner:iam.establish_workspace_creator_access(uuid, uuid)',
    'project_owner:con.admit_project_binding_revision(uuid, uuid, uuid, uuid, text)',
    'project_owner:con.get_project_binding_name(uuid, uuid, uuid)',
    'project_owner:iam.admit_connection_selection(uuid, uuid, text, uuid)',
    'project_owner:project.list_connection_bindings(uuid, uuid)',
    'project_owner:project.prepare_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean)',
    'project_owner:project.settle_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean, text, text, jsonb, text)',
  ])
  await assertSignatures(client, 'MIGRATION_011_SCHEMA_PRIVILEGE_REFUSED', `
    WITH roles(role_name) AS (
      SELECT rolname FROM pg_roles WHERE rolname LIKE 'hub\\_%' ESCAPE '\\'
      UNION ALL SELECT role_name FROM (VALUES
        ('brain_owner'), ('connections_owner'), ('iam_owner'), ('project_owner'),
        ('registry_owner'), ('workspace_owner'), ('public')
      ) AS owner_roles(role_name)
    ), schemas(schema_name) AS (VALUES ('brn'), ('con'), ('reg'))
    SELECT roles.role_name || ':' || schemas.schema_name || ':' ||
      has_schema_privilege(roles.role_name, schemas.schema_name, 'USAGE') || ':' ||
      has_schema_privilege(roles.role_name, schemas.schema_name, 'CREATE') AS signature
    FROM roles CROSS JOIN schemas
    WHERE has_schema_privilege(roles.role_name, schemas.schema_name, 'USAGE,CREATE')
    ORDER BY roles.role_name, schemas.schema_name
  `, [
    'brain_owner:brn:true:true',
    'connections_owner:con:true:true',
    'hub_r2_brain_bootstrap:brn:true:false',
    'hub_r2_brain_bootstrap:reg:true:false',
    'hub_r2_brain_read:brn:true:false',
    'hub_r2_brain_read:reg:true:false',
    'hub_r2_connections:con:true:false',
    'project_owner:con:true:false',
    'registry_owner:reg:true:true',
  ])
  await assertSignatures(client, 'MIGRATION_011_R2_SCHEMA_MATRIX_REFUSED', `
    WITH roles(role_name) AS (VALUES ('hub_r2_brain_bootstrap'), ('hub_r2_brain_read'), ('hub_r2_connections'), ('hub_r2_project_binding')),
    schemas(schema_name) AS (VALUES ('iam'), ('workspace'), ('project'), ('reg'), ('brn'), ('con'))
    SELECT roles.role_name || ':' || schemas.schema_name || ':' ||
      has_schema_privilege(roles.role_name, schemas.schema_name, 'USAGE') || ':' ||
      has_schema_privilege(roles.role_name, schemas.schema_name, 'CREATE') AS signature
    FROM roles CROSS JOIN schemas
    ORDER BY roles.role_name, schemas.schema_name
  `, [
    'hub_r2_brain_bootstrap:brn:true:false',
    'hub_r2_brain_bootstrap:con:false:false',
    'hub_r2_brain_bootstrap:iam:false:false',
    'hub_r2_brain_bootstrap:project:false:false',
    'hub_r2_brain_bootstrap:reg:true:false',
    'hub_r2_brain_bootstrap:workspace:false:false',
    'hub_r2_brain_read:brn:true:false',
    'hub_r2_brain_read:con:false:false',
    'hub_r2_brain_read:iam:true:false',
    'hub_r2_brain_read:project:false:false',
    'hub_r2_brain_read:reg:true:false',
    'hub_r2_brain_read:workspace:false:false',
    'hub_r2_connections:brn:false:false',
    'hub_r2_connections:con:true:false',
    'hub_r2_connections:iam:true:false',
    'hub_r2_connections:project:false:false',
    'hub_r2_connections:reg:false:false',
    'hub_r2_connections:workspace:false:false',
    'hub_r2_project_binding:brn:false:false',
    'hub_r2_project_binding:con:false:false',
    'hub_r2_project_binding:iam:false:false',
    'hub_r2_project_binding:project:true:false',
    'hub_r2_project_binding:reg:false:false',
    'hub_r2_project_binding:workspace:false:false',
  ])
  await assertSignatures(client, 'MIGRATION_011_R2_FUNCTION_MATRIX_REFUSED', `
    WITH roles(role_name) AS (VALUES ('hub_r2_brain_bootstrap'), ('hub_r2_brain_read'), ('hub_r2_connections'), ('hub_r2_project_binding'))
    SELECT roles.role_name || ':' || n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature
    FROM roles CROSS JOIN pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
      AND has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
    ORDER BY roles.role_name, n.nspname, p.proname, oidvectortypes(p.proargtypes)
  `, [
    'hub_r2_brain_bootstrap:brn.bootstrap_brain_health(text, uuid, text, jsonb)',
    'hub_r2_brain_bootstrap:reg.bootstrap_workspace_brain(uuid, uuid, uuid, text, text, jsonb)',
    'hub_r2_brain_read:brn.get_brain_health(uuid, text)',
    'hub_r2_brain_read:iam.admit_brain_read(uuid, uuid)',
    'hub_r2_brain_read:reg.get_brain_revision(uuid, uuid, uuid[])',
    'hub_r2_brain_read:reg.get_workspace_brain(uuid, uuid[])',
    'hub_r2_brain_read:reg.list_brain_revisions(uuid, uuid[])',
    'hub_r2_connections:con.create_or_replay_connection(uuid, text, uuid, text, text, uuid, uuid, text, text, text, jsonb, text)',
    'hub_r2_connections:con.get_connection(uuid, uuid)',
    'hub_r2_connections:con.get_connection_qualification(uuid, uuid, uuid)',
    'hub_r2_connections:con.list_connections(uuid, text, uuid, uuid)',
    'hub_r2_connections:con.reserve_connection_credential(uuid, uuid, text, text)',
    'hub_r2_connections:con.reserve_connection_qualification(uuid, uuid, uuid, text, text, text, uuid, uuid)',
    'hub_r2_connections:con.revise_connection(uuid, uuid, uuid, uuid, jsonb, text)',
    'hub_r2_connections:con.settle_connection_credential(uuid, uuid, text, text, bigint)',
    'hub_r2_connections:con.settle_connection_qualification(uuid, uuid, uuid, uuid, bigint, text, uuid, text, text, jsonb, text[], timestamp with time zone)',
    'hub_r2_connections:iam.admit_any_connection_read(uuid)',
    ...(withR2Recovery ? [
      'hub_r2_project_binding:project.abort_binding_source_intent(uuid, uuid, uuid, bigint, text)',
      'hub_r2_project_binding:project.begin_connection_binding_intent(uuid, uuid, uuid, uuid, text, jsonb, boolean, uuid)',
      'hub_r2_project_binding:project.complete_binding_source_abort(uuid, uuid, uuid, bigint, text)',
      'hub_r2_project_binding:project.complete_binding_source_intent(uuid, uuid, uuid, bigint)',
      'hub_r2_project_binding:project.freeze_binding_source_intent(uuid, uuid, uuid, bigint, text, text, text, text, text, text)',
      ...(withR2Concordance ? [
      'hub_r2_project_binding:project.get_binding_source_basis(uuid, uuid, uuid, bigint)',
      ] : []),
      'hub_r2_project_binding:project.get_binding_source_intent(uuid, uuid, uuid)',
    ] : []),
    'hub_r2_project_binding:project.list_connection_bindings(uuid, uuid)',
    'hub_r2_project_binding:project.prepare_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean)',
    ...(withR2Recovery ? [
      'hub_r2_project_binding:project.validate_binding_source_intent(uuid, uuid, uuid, bigint)',
    ] : []),
    ...(!withR2Recovery ? [
      'hub_r2_project_binding:project.settle_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean, text, text, jsonb, text)',
    ] : []),
  ])
  await assertSignatures(client, 'MIGRATION_011_R2_TABLE_MATRIX_REFUSED', `
    WITH roles(role_name) AS (VALUES ('hub_r2_brain_bootstrap'), ('hub_r2_brain_read'), ('hub_r2_connections'), ('hub_r2_project_binding'))
    SELECT roles.role_name || ':' || tables.table_schema || '.' || tables.table_name AS signature
    FROM roles CROSS JOIN information_schema.tables
    WHERE tables.table_schema IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
      AND has_table_privilege(roles.role_name,
        quote_ident(tables.table_schema) || '.' || quote_ident(tables.table_name),
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    ORDER BY roles.role_name, tables.table_schema, tables.table_name
  `, [])
  await assertSignatures(client, 'MIGRATION_011_DIRECT_ACL_REFUSED', `
    SELECT n.nspname || ':' || coalesce(grantee.rolname, 'public') || ':' || acl.privilege_type || ':' ||
      acl.is_grantable AS signature
    FROM pg_namespace AS n
    CROSS JOIN LATERAL aclexplode(n.nspacl) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE n.nspname IN ('brn', 'con', 'reg')
      AND NOT (NOT acl.is_grantable AND (
        (grantee.rolname = pg_get_userbyid(n.nspowner) AND acl.privilege_type IN ('CREATE', 'USAGE'))
        OR (n.nspname IN ('brn', 'reg') AND grantee.rolname IN ('hub_r2_brain_bootstrap', 'hub_r2_brain_read')
          AND acl.privilege_type = 'USAGE')
        OR (n.nspname = 'con' AND grantee.rolname = 'hub_r2_connections' AND acl.privilege_type = 'USAGE')
        OR (n.nspname = 'con' AND grantee.rolname = 'project_owner' AND acl.privilege_type = 'USAGE')
      ))
    ORDER BY n.nspname, grantee.rolname, acl.privilege_type
  `, [])
  await assertSignatures(client, 'MIGRATION_011_DIRECT_ACL_REFUSED', `
    SELECT n.nspname || '.' || p.proname || ':' || coalesce(grantee.rolname, 'public') || ':' || acl.privilege_type || ':' ||
      acl.is_grantable AS signature
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE (n.nspname IN ('brn', 'reg') OR (n.nspname = 'iam' AND p.proname = 'admit_brain_read'))
      AND NOT (NOT acl.is_grantable AND (
        (grantee.rolname = pg_get_userbyid(p.proowner) AND acl.privilege_type = 'EXECUTE')
        OR (n.nspname = 'brn' AND p.proname = 'bootstrap_brain_health'
          AND grantee.rolname = 'hub_r2_brain_bootstrap' AND acl.privilege_type = 'EXECUTE')
        OR (n.nspname = 'brn' AND p.proname = 'get_brain_health'
          AND grantee.rolname = 'hub_r2_brain_read' AND acl.privilege_type = 'EXECUTE')
        OR (n.nspname = 'reg' AND p.proname = 'bootstrap_workspace_brain'
          AND grantee.rolname = 'hub_r2_brain_bootstrap' AND acl.privilege_type = 'EXECUTE')
        OR (n.nspname = 'reg' AND p.proname IN ('get_brain_revision', 'get_workspace_brain', 'list_brain_revisions')
          AND grantee.rolname = 'hub_r2_brain_read' AND acl.privilege_type = 'EXECUTE')
        OR (n.nspname = 'iam' AND p.proname = 'admit_brain_read'
          AND grantee.rolname = 'hub_r2_brain_read' AND acl.privilege_type = 'EXECUTE')
      ))
    ORDER BY n.nspname, p.proname, grantee.rolname, acl.privilege_type
  `, [])
  await assertSignatures(client, 'MIGRATION_011_DIRECT_ACL_REFUSED', `
    SELECT n.nspname || '.' || c.relname || ':' || coalesce(grantee.rolname, 'public') || ':' || acl.privilege_type || ':' ||
      acl.is_grantable AS signature
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE n.nspname IN ('brn', 'con', 'reg') AND c.relkind IN ('r', 'p')
      AND (grantee.rolname IS DISTINCT FROM pg_get_userbyid(c.relowner) OR acl.is_grantable)
    ORDER BY n.nspname, c.relname, grantee.rolname, acl.privilege_type
  `, [])
  await assertSignatures(client, 'MIGRATION_011_EXTERNAL_PRINCIPAL_ACL_REFUSED', `
    WITH known_principal(role_name) AS (VALUES
      ('hub_iam_runtime'), ('hub_prj03_command'), ('hub_r2_brain_bootstrap'), ('hub_r2_brain_read'),
      ('hub_r2_connections'), ('hub_r2_project_binding'),
      ('hub_s2_read'), ('hub_s3_read'), ('hub_s4_baseline_command'), ('hub_s4_baseline_read'),
      ('hub_s6_inception_command'), ('hub_ws01_command'),
      ('brain_owner'), ('connections_owner'), ('iam_owner'), ('project_owner'), ('registry_owner'), ('workspace_owner')
    ), acl_entries AS (
      SELECT 'schema:' || n.nspname AS object_name, n.nspowner AS owner_oid, acl.grantee,
        acl.privilege_type, acl.is_grantable
      FROM pg_namespace AS n CROSS JOIN LATERAL aclexplode(n.nspacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
      UNION ALL
      SELECT 'table:' || n.nspname || '.' || c.relname, c.relowner, acl.grantee,
        acl.privilege_type, acl.is_grantable
      FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con') AND c.relkind IN ('r', 'p')
      UNION ALL
      SELECT 'function:' || n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')',
        p.proowner, acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(p.proacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
    )
    SELECT acl_entries.object_name || ':' || coalesce(grantee.rolname, 'public') || ':' ||
      acl_entries.privilege_type || ':' || acl_entries.is_grantable AS signature
    FROM acl_entries
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl_entries.grantee
    WHERE acl_entries.grantee <> acl_entries.owner_oid AND (
      acl_entries.is_grantable
      OR NOT EXISTS (SELECT 1 FROM known_principal WHERE known_principal.role_name = grantee.rolname)
    )
    ORDER BY acl_entries.object_name, grantee.rolname
  `, [])
  await assertSignatures(client, 'MIGRATION_011_CROSS_OWNER_ACL_REFUSED', `
    WITH owner_roles(role_name) AS (VALUES
      ('brain_owner'), ('connections_owner'), ('iam_owner'), ('project_owner'), ('registry_owner'), ('workspace_owner')
    ), acl_entries AS (
      SELECT 'schema:' || n.nspname AS object_name, n.nspowner AS owner_oid, acl.grantee,
        acl.privilege_type, acl.is_grantable
      FROM pg_namespace AS n CROSS JOIN LATERAL aclexplode(n.nspacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
      UNION ALL
      SELECT 'table:' || n.nspname || '.' || c.relname, c.relowner, acl.grantee,
        acl.privilege_type, acl.is_grantable
      FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con') AND c.relkind IN ('r', 'p')
      UNION ALL
      SELECT 'function:' || n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')',
        p.proowner, acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(p.proacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
    )
    SELECT acl_entries.object_name || ':' || grantee.rolname || ':' || acl_entries.privilege_type || ':' ||
      acl_entries.is_grantable AS signature
    FROM acl_entries JOIN pg_roles AS grantee ON grantee.oid = acl_entries.grantee
    WHERE acl_entries.grantee <> acl_entries.owner_oid
      AND EXISTS (SELECT 1 FROM owner_roles WHERE owner_roles.role_name = grantee.rolname)
    ORDER BY acl_entries.object_name, grantee.rolname, acl_entries.privilege_type
  `, [
    'function:con.admit_project_binding_revision(uuid, uuid, uuid, uuid, text):project_owner:EXECUTE:false',
    'function:con.get_project_binding_name(uuid, uuid, uuid):project_owner:EXECUTE:false',
    'function:iam.admit_connection_manage(uuid, text, uuid):connections_owner:EXECUTE:false',
    'function:iam.admit_connection_qualify(uuid, text, uuid):connections_owner:EXECUTE:false',
    'function:iam.admit_connection_read(uuid, text, uuid):connections_owner:EXECUTE:false',
    'function:iam.admit_connection_selection(uuid, uuid, text, uuid):connections_owner:EXECUTE:false',
    'function:iam.admit_connection_selection(uuid, uuid, text, uuid):project_owner:EXECUTE:false',
    'function:iam.admit_project_manage(uuid, uuid):project_owner:EXECUTE:false',
    'function:iam.can_create_project(uuid, uuid):project_owner:EXECUTE:false',
    'schema:con:project_owner:USAGE:false',
    'schema:iam:connections_owner:USAGE:false',
    'schema:iam:project_owner:USAGE:false',
    'schema:project:connections_owner:USAGE:false',
    'schema:project:iam_owner:USAGE:false',
    'schema:workspace:connections_owner:USAGE:false',
    'schema:workspace:iam_owner:USAGE:false',
    'schema:workspace:project_owner:USAGE:false',
    'schema:workspace:registry_owner:USAGE:false',
    'table:iam.account_project_grant:project_owner:SELECT:false',
    'table:project.operation_idempotency:iam_owner:SELECT:false',
    'table:project.project:connections_owner:REFERENCES:false',
    'table:project.project:iam_owner:REFERENCES:false',
    'table:workspace.workspace:connections_owner:REFERENCES:false',
    'table:workspace.workspace:iam_owner:REFERENCES:false',
    'table:workspace.workspace:project_owner:REFERENCES:false',
    'table:workspace.workspace:registry_owner:REFERENCES:false',
  ])
  await assertRowsDigest(client, 'MIGRATION_011_RUNTIME_ACL_CENSUS_REFUSED', `
    WITH acl_entries AS (
      SELECT 'schema' AS object_kind, n.nspname AS schema_name, n.nspname AS object_identity,
        n.nspowner AS owner_oid, acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_namespace AS n CROSS JOIN LATERAL aclexplode(n.nspacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
      UNION ALL
      SELECT 'table', n.nspname, c.relname, c.relowner, acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con') AND c.relkind IN ('r', 'p')
      UNION ALL
      SELECT 'column', n.nspname, c.relname || '.' || a.attname, c.relowner,
        acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_attribute AS a JOIN pg_class AS c ON c.oid = a.attrelid
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con') AND c.relkind IN ('r', 'p')
        AND a.attnum > 0 AND NOT a.attisdropped
      UNION ALL
      SELECT 'function', n.nspname, p.proname || '(' || oidvectortypes(p.proargtypes) || ')',
        p.proowner, acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(p.proacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
    )
    SELECT object_kind, schema_name, object_identity, grantee.rolname AS grantee,
      privilege_type, is_grantable
    FROM acl_entries JOIN pg_roles AS grantee ON grantee.oid = acl_entries.grantee
    WHERE acl_entries.grantee <> acl_entries.owner_oid
    ORDER BY object_kind, schema_name, object_identity, grantee.rolname, privilege_type
  `, withR2Concordance
    ? '550508cc1706ac597cb697d8b2e99bfc0719890478f993878238e63fa7a151fa'
    : withR2Recovery
      ? '609126cc20a3ee9dd3336807cca0d1a740178cf6c0d1274b5e2b6a4c86e41bae'
      : 'c28c18468a037b845e2c9d5b1ed4a1fd5756cde620a0dc8d7efa8a4c44d2027e')
  await assertSignatures(client, 'MIGRATION_011_DEFAULT_ACL_REFUSED', `
    SELECT owner.rolname || ':' || coalesce(namespace.nspname, 'GLOBAL') || ':' || defaults.defaclobjtype::text || ':' ||
      coalesce(grantee.rolname, 'public') || ':' || acl.privilege_type || ':' || acl.is_grantable AS signature
    FROM pg_default_acl AS defaults
    JOIN pg_roles AS owner ON owner.oid = defaults.defaclrole
    LEFT JOIN pg_namespace AS namespace ON namespace.oid = defaults.defaclnamespace
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE owner.rolname IN ('brain_owner', 'connections_owner', 'iam_owner', 'project_owner', 'registry_owner', 'workspace_owner')
      AND (defaults.defaclnamespace = 0 OR namespace.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con'))
    ORDER BY owner.rolname, namespace.nspname, defaults.defaclobjtype, grantee.rolname, acl.privilege_type
  `, [])
  await assertSignatures(client, 'MIGRATION_011_CATALOG_REFUSED', `
    SELECT source_namespace.nspname || '.' || source_relation.relname || '.' || constraint_row.conname || ':' ||
      pg_get_constraintdef(constraint_row.oid, true) AS signature
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS source_relation ON source_relation.oid = constraint_row.conrelid
    JOIN pg_namespace AS source_namespace ON source_namespace.oid = source_relation.relnamespace
    JOIN pg_class AS target_relation ON target_relation.oid = constraint_row.confrelid
    JOIN pg_namespace AS target_namespace ON target_namespace.oid = target_relation.relnamespace
    WHERE constraint_row.contype = 'f' AND source_namespace.nspname <> target_namespace.nspname
      AND source_namespace.nspname IN ('brn', 'con', 'project', 'reg')
      AND (source_namespace.nspname IN ('brn', 'con', 'reg')
        OR source_relation.relname IN ('brain_binding', 'connection_binding'))
    ORDER BY source_namespace.nspname, source_relation.relname, constraint_row.conname
  `, [
    'con.connection.connection_project_id_fkey:FOREIGN KEY (project_id) REFERENCES project.project(project_id) ON DELETE RESTRICT',
    'con.connection.connection_workspace_id_fkey:FOREIGN KEY (workspace_id) REFERENCES workspace.workspace(workspace_id) ON DELETE RESTRICT',
    'reg.artifact.artifact_workspace_id_fkey:FOREIGN KEY (workspace_id) REFERENCES workspace.workspace(workspace_id) ON DELETE RESTRICT',
  ])
  const boundary = (await client.query(`
    SELECT has_schema_privilege('public', 'reg', 'USAGE') AS public_reg,
      has_schema_privilege('public', 'brn', 'USAGE') AS public_brn,
      has_schema_privilege('public', 'con', 'USAGE') AS public_con,
      has_table_privilege('registry_owner', 'con.connection', 'SELECT') AS registry_to_connections,
      has_table_privilege('brain_owner', 'reg.artifact', 'SELECT') AS brain_to_registry,
      has_table_privilege('connections_owner', 'project.project', 'SELECT') AS connections_to_project,
      has_table_privilege('project_owner', 'con.connection', 'SELECT') AS project_to_connections,
      pg_has_role('registry_owner', 'connections_owner', 'MEMBER') AS registry_member,
      pg_has_role('brain_owner', 'registry_owner', 'MEMBER') AS brain_member,
      pg_has_role('connections_owner', 'project_owner', 'MEMBER') AS connections_member,
      has_schema_privilege('hub_r2_brain_read', 'iam', 'CREATE') AS read_iam_create,
      has_schema_privilege('hub_r2_brain_read', 'reg', 'CREATE') AS read_reg_create,
      has_schema_privilege('hub_r2_brain_read', 'brn', 'CREATE') AS read_brn_create,
      has_schema_privilege('hub_r2_brain_bootstrap', 'reg', 'CREATE') AS bootstrap_reg_create,
      has_schema_privilege('hub_r2_brain_bootstrap', 'brn', 'CREATE') AS bootstrap_brn_create,
      has_schema_privilege('hub_r2_connections', 'iam', 'USAGE') AS connections_iam_usage,
      has_schema_privilege('hub_r2_connections', 'con', 'USAGE') AS connections_con_usage,
      has_schema_privilege('hub_r2_connections', 'con', 'CREATE') AS connections_con_create,
      pg_has_role('hub_r2_connections', 'connections_owner', 'MEMBER') AS connections_owner_member,
      pg_has_role('hub_r2_brain_read', 'iam_owner', 'MEMBER') AS read_iam_member,
      pg_has_role('hub_r2_brain_read', 'registry_owner', 'MEMBER') AS read_registry_member,
      pg_has_role('hub_r2_brain_read', 'brain_owner', 'MEMBER') AS read_brain_member,
      pg_has_role('hub_r2_brain_bootstrap', 'registry_owner', 'MEMBER') AS bootstrap_registry_member,
      pg_has_role('hub_r2_brain_bootstrap', 'brain_owner', 'MEMBER') AS bootstrap_brain_member,
      has_schema_privilege('hub_r2_brain_read', 'iam', 'USAGE') AS read_iam_usage,
      has_schema_privilege('hub_r2_brain_bootstrap', 'iam', 'USAGE') AS bootstrap_iam_usage
  `)).rows[0]
  if (JSON.stringify(boundary) !== JSON.stringify({
    public_reg: false, public_brn: false, public_con: false,
    registry_to_connections: false, brain_to_registry: false,
    connections_to_project: false, project_to_connections: false,
    registry_member: false, brain_member: false, connections_member: false,
    read_iam_create: false, read_reg_create: false, read_brn_create: false,
    bootstrap_reg_create: false, bootstrap_brn_create: false,
    connections_iam_usage: true, connections_con_usage: true, connections_con_create: false,
    connections_owner_member: false,
    read_iam_member: false, read_registry_member: false, read_brain_member: false,
    bootstrap_registry_member: false, bootstrap_brain_member: false,
    read_iam_usage: true, bootstrap_iam_usage: false,
  })) fail('MIGRATION_011_PRIVILEGE_REFUSED')
  await assertSignatures(client, 'MIGRATION_011_ROLE_MEMBERSHIP_REFUSED', `
    SELECT granted.rolname || ':' || member.rolname AS signature
    FROM pg_auth_members AS membership
    JOIN pg_roles AS granted ON granted.oid = membership.roleid
    JOIN pg_roles AS member ON member.oid = membership.member
    WHERE granted.rolname LIKE 'hub\\_%' ESCAPE '\\' OR member.rolname LIKE 'hub\\_%' ESCAPE '\\'
      OR granted.rolname IN ('brain_owner', 'connections_owner', 'iam_owner', 'project_owner', 'registry_owner', 'workspace_owner')
      OR member.rolname IN ('brain_owner', 'connections_owner', 'iam_owner', 'project_owner', 'registry_owner', 'workspace_owner')
    ORDER BY granted.rolname, member.rolname
  `, [])
  await assertSignatures(client, 'MIGRATION_011_RUNTIME_ROLE_PRIVILEGE_REFUSED', `
    WITH runtime_roles(role_name) AS (
      SELECT rolname FROM pg_roles WHERE rolcanlogin AND rolname LIKE 'hub\\_%' ESCAPE '\\'
    ), protected_schemas(schema_name) AS (VALUES ('brn'), ('con'), ('project'), ('reg'))
    SELECT runtime_roles.role_name || ':' || protected_schemas.schema_name AS signature
    FROM runtime_roles CROSS JOIN protected_schemas
    WHERE (protected_schemas.schema_name <> 'project' OR runtime_roles.role_name = 'hub_r2_project_binding')
      AND has_schema_privilege(runtime_roles.role_name, protected_schemas.schema_name, 'USAGE')
    ORDER BY runtime_roles.role_name, protected_schemas.schema_name
  `, [
    ...(after015 ? ['hub_r2_brain_attester:brn', 'hub_r2_brain_attester:reg'] : []),
    'hub_r2_brain_bootstrap:brn',
    'hub_r2_brain_bootstrap:reg',
    'hub_r2_brain_read:brn',
    'hub_r2_brain_read:reg',
    'hub_r2_connections:con',
    'hub_r2_project_binding:project',
  ])
  await assertSignatures(client, 'MIGRATION_011_RUNTIME_ROLE_PRIVILEGE_REFUSED', `
    WITH runtime_roles(role_name) AS (
      SELECT rolname FROM pg_roles WHERE rolcanlogin AND rolname LIKE 'hub\\_%' ESCAPE '\\'
    )
    SELECT runtime_roles.role_name || ':' || tables.table_schema || '.' || tables.table_name AS signature
    FROM runtime_roles CROSS JOIN information_schema.tables
    WHERE (tables.table_schema IN ('brn', 'con', 'reg')
      OR (tables.table_schema = 'project' AND tables.table_name IN ('brain_binding', 'connection_binding')))
      AND has_table_privilege(runtime_roles.role_name,
        quote_ident(tables.table_schema) || '.' || quote_ident(tables.table_name),
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    ORDER BY runtime_roles.role_name, tables.table_schema, tables.table_name
  `, [])
  await assertSignatures(client, 'MIGRATION_011_OWNER_ROLE_PRIVILEGE_REFUSED', `
    WITH owner_roles(role_name) AS (VALUES
      ('brain_owner'), ('connections_owner'), ('iam_owner'), ('project_owner'),
      ('registry_owner'), ('workspace_owner')
    ), protected_tables(table_schema, table_name, expected_owner) AS (VALUES
      ('brn', 'binding_validation', 'brain_owner'), ('brn', 'health', 'brain_owner'),
      ('con', 'connection', 'connections_owner'),
      ('con', 'connection_qualification', 'connections_owner'),
      ('con', 'connection_revision', 'connections_owner'),
      ('con', 'operation_receipt', 'connections_owner'),
      ('project', 'brain_binding', 'project_owner'),
      ('project', 'connection_binding', 'project_owner'),
      ${withR2Recovery ? "('project', 'binding_source_intent', 'project_owner')," : ''}
      ('reg', 'artifact', 'registry_owner'), ('reg', 'artifact_revision', 'registry_owner')
    )
    SELECT owner_roles.role_name || ':' || protected_tables.table_schema || '.' || protected_tables.table_name AS signature
    FROM owner_roles CROSS JOIN protected_tables
    WHERE owner_roles.role_name <> protected_tables.expected_owner
      AND has_table_privilege(owner_roles.role_name,
        quote_ident(protected_tables.table_schema) || '.' || quote_ident(protected_tables.table_name),
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    ORDER BY owner_roles.role_name, protected_tables.table_schema, protected_tables.table_name
  `, [])
}

const assert012Catalog = async (
  client,
  migration003,
  migration005,
  migration006,
  migration011,
  migration012,
  { withR2Concordance = false, after014 = false, after015 = false, after017 = false, after019 = false } = {},
) => {
  await assert011Catalog(client, migration003, migration005, migration006, migration011, {
    withR2Recovery: true,
    withR2Concordance,
    after014,
    after015,
  })
  await assertSignatures(client, 'MIGRATION_012_ROLE_CENSUS_REFUSED', `
    SELECT rolname || ':' || rolcanlogin || ':' || rolsuper || ':' || rolinherit || ':' || rolcreaterole || ':' ||
      rolcreatedb || ':' || rolreplication || ':' || rolbypassrls AS signature
    FROM pg_roles
    WHERE (rolname LIKE 'hub\\_%' ESCAPE '\\'
      OR rolname IN ('brain_owner', 'connections_owner', 'iam_owner', 'project_owner', 'registry_owner', 'workspace_owner'
        ${after019 ? ", 'builder_owner'" : ''}))
      ${after015 ? '' : "AND rolname <> 'hub_r2_brain_attester'"}
      ${after017 ? '' : "AND rolname <> 'hub_r2_key_conformance_subject'"}
      ${after019 ? '' : "AND rolname NOT IN ('builder_owner', 'hub_rb_ingress', 'hub_rb_executor')"}
    ORDER BY rolname
  `, [
    'brain_owner:false:false:false:false:false:false:false',
    ...(after019 ? ['builder_owner:false:false:false:false:false:false:false'] : []),
    'connections_owner:false:false:false:false:false:false:false',
    'hub_iam_runtime:true:false:false:false:false:false:false',
    'hub_prj03_command:true:false:false:false:false:false:false',
    ...(after015 ? ['hub_r2_brain_attester:true:false:false:false:false:false:false'] : []),
    'hub_r2_brain_bootstrap:true:false:false:false:false:false:false',
    'hub_r2_brain_read:true:false:false:false:false:false:false',
    'hub_r2_connections:true:false:false:false:false:false:false',
    ...(after017 ? ['hub_r2_key_conformance_subject:true:false:false:false:false:false:false'] : []),
    'hub_r2_project_binding:true:false:false:false:false:false:false',
    ...(after019 ? ['hub_rb_executor:true:false:false:false:false:false:false', 'hub_rb_ingress:true:false:false:false:false:false:false'] : []),
    'hub_s2_read:true:false:false:false:false:false:false',
    'hub_s3_read:true:false:false:false:false:false:false',
    'hub_s4_baseline_command:true:false:false:false:false:false:false',
    'hub_s4_baseline_read:true:false:false:false:false:false:false',
    'hub_s6_inception_command:true:false:false:false:false:false:false',
    'hub_ws01_command:true:false:false:false:false:false:false',
    'iam_owner:false:false:false:false:false:false:false',
    'project_owner:false:false:false:false:false:false:false',
    'registry_owner:false:false:false:false:false:false:false',
    'workspace_owner:false:false:false:false:false:false:false',
  ])
  const functionBodies = after014 ? [] : (await client.query(`
    SELECT n.nspname || '.' || p.proname AS name, p.prosrc AS definition
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'project' AND p.proname IN (
      'abort_binding_source_intent', 'begin_connection_binding_intent',
      'complete_binding_source_abort', 'complete_binding_source_intent',
      'freeze_binding_source_intent', 'get_binding_source_intent',
      'guard_inception_binding_source', 'lock_binding_project', 'validate_binding_source_intent'
    )
    ORDER BY name
  `)).rows
  if (!after014 && JSON.stringify(functionBodies) !== JSON.stringify(expected012FunctionBodies(migration012))) {
    fail('MIGRATION_012_FUNCTION_SOURCE_REFUSED')
  }
  if (!after014) await assertSignatures(client, 'MIGRATION_012_TABLE_CATALOG_REFUSED', `
    SELECT table_schema || ':' || table_name || ':' || column_name || ':' || udt_name || ':' || is_nullable || ':' ||
      coalesce(column_default, '') AS signature
    FROM information_schema.columns
    WHERE table_schema = 'project' AND table_name = 'binding_source_intent'
    ORDER BY ordinal_position
  `, [
    'project:binding_source_intent:intent_id:uuid:NO:',
    'project:binding_source_intent:project_id:uuid:NO:',
    'project:binding_source_intent:account_id:uuid:NO:',
    'project:binding_source_intent:workspace_id:uuid:NO:',
    'project:binding_source_intent:connection_id:uuid:NO:',
    'project:binding_source_intent:connection_revision_id:uuid:NO:',
    'project:binding_source_intent:environment:text:NO:',
    'project:binding_source_intent:expected_current:jsonb:NO:',
    'project:binding_source_intent:remove_binding:bool:NO:',
    'project:binding_source_intent:source_revision:text:NO:',
    'project:binding_source_intent:declaration:jsonb:NO:',
    'project:binding_source_intent:prepared_result:jsonb:YES:',
    'project:binding_source_intent:declaration_digest:text:YES:',
    'project:binding_source_intent:base_tree:text:YES:',
    'project:binding_source_intent:previous_declaration_blob:text:YES:',
    'project:binding_source_intent:apply_source_revision:text:YES:',
    'project:binding_source_intent:cancel_base_source_revision:text:YES:',
    'project:binding_source_intent:cancel_applied_source_revision:text:YES:',
    "project:binding_source_intent:state:text:NO:'PREPARING'::text",
    'project:binding_source_intent:version:int8:NO:0',
    'project:binding_source_intent:terminal_source_revision:text:YES:',
    'project:binding_source_intent:terminal_result:jsonb:YES:',
    'project:binding_source_intent:refusal_code:text:YES:',
    'project:binding_source_intent:created_at:timestamptz:NO:clock_timestamp()',
    'project:binding_source_intent:completed_at:timestamptz:YES:',
  ])
  if (!after014) await assertSignatures(client, 'MIGRATION_012_TABLE_CATALOG_REFUSED', `
    SELECT c.relname || ':' || constraint_row.conname || ':' || constraint_row.contype::text || ':' ||
      pg_get_constraintdef(constraint_row.oid, true) AS signature
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS c ON c.oid = constraint_row.conrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'project' AND c.relname = 'binding_source_intent'
    ORDER BY c.relname, constraint_row.conname
  `, [
    `binding_source_intent:binding_source_intent_apply_source_revision_check:c:CHECK (apply_source_revision ~ '^[0-9a-f]{40}$'::text)`,
    `binding_source_intent:binding_source_intent_base_tree_check:c:CHECK (base_tree ~ '^[0-9a-f]{40}$'::text)`,
    `binding_source_intent:binding_source_intent_cancel_applied_source_revision_check:c:CHECK (cancel_applied_source_revision ~ '^[0-9a-f]{40}$'::text)`,
    `binding_source_intent:binding_source_intent_cancel_base_source_revision_check:c:CHECK (cancel_base_source_revision ~ '^[0-9a-f]{40}$'::text)`,
    `binding_source_intent:binding_source_intent_declaration_digest_check:c:CHECK (declaration_digest ~ '^[0-9a-f]{64}$'::text)`,
    `binding_source_intent:binding_source_intent_environment_check:c:CHECK (environment = ANY (ARRAY['SANDBOX'::text, 'PRODUCTION'::text]))`,
    `binding_source_intent:binding_source_intent_frozen:c:CHECK (state = 'PREPARING'::text OR state = 'ABORTED'::text AND declaration_digest IS NULL AND base_tree IS NULL AND previous_declaration_blob IS NULL AND apply_source_revision IS NULL AND cancel_base_source_revision IS NULL AND cancel_applied_source_revision IS NULL OR declaration_digest IS NOT NULL AND base_tree IS NOT NULL AND apply_source_revision IS NOT NULL AND cancel_base_source_revision IS NOT NULL AND cancel_applied_source_revision IS NOT NULL AND source_revision <> apply_source_revision AND source_revision <> cancel_base_source_revision AND source_revision <> cancel_applied_source_revision AND apply_source_revision <> cancel_base_source_revision AND apply_source_revision <> cancel_applied_source_revision AND cancel_base_source_revision <> cancel_applied_source_revision)`,
    'binding_source_intent:binding_source_intent_pkey:p:PRIMARY KEY (intent_id)',
    `binding_source_intent:binding_source_intent_previous_declaration_blob_check:c:CHECK (previous_declaration_blob ~ '^[0-9a-f]{40}$'::text)`,
    'binding_source_intent:binding_source_intent_project_id_fkey:f:FOREIGN KEY (project_id) REFERENCES project.project(project_id)',
    `binding_source_intent:binding_source_intent_source_revision_check:c:CHECK (source_revision ~ '^[0-9a-f]{40}$'::text)`,
    `binding_source_intent:binding_source_intent_state_check:c:CHECK (state = ANY (ARRAY['PREPARING'::text, 'APPLYING'::text, 'ABORTING'::text, 'COMPLETED'::text, 'ABORTED'::text]))`,
    `binding_source_intent:binding_source_intent_terminal:c:CHECK ((state = ANY (ARRAY['PREPARING'::text, 'APPLYING'::text, 'ABORTING'::text])) AND completed_at IS NULL AND terminal_source_revision IS NULL OR state = 'COMPLETED'::text AND completed_at IS NOT NULL AND terminal_source_revision IS NOT NULL AND terminal_source_revision = apply_source_revision OR state = 'ABORTED'::text AND completed_at IS NOT NULL AND terminal_source_revision IS NOT NULL AND (apply_source_revision IS NULL AND terminal_source_revision = source_revision OR apply_source_revision IS NOT NULL AND (terminal_source_revision = cancel_base_source_revision OR terminal_source_revision = cancel_applied_source_revision)))`,
    `binding_source_intent:binding_source_intent_terminal_source_revision_check:c:CHECK (terminal_source_revision ~ '^[0-9a-f]{40}$'::text)`,
    'binding_source_intent:binding_source_intent_version_check:c:CHECK (version >= 0)',
  ])
  await assertSignatures(client, 'MIGRATION_012_TABLE_CATALOG_REFUSED', `
    SELECT tablename || ':' || indexname || ':' || indexdef AS signature
    FROM pg_indexes WHERE schemaname = 'project' AND tablename = 'binding_source_intent'
    ORDER BY tablename, indexname
  `, [
    "binding_source_intent:binding_source_intent_one_active:CREATE UNIQUE INDEX binding_source_intent_one_active ON project.binding_source_intent USING btree (project_id) WHERE (state = ANY (ARRAY['PREPARING'::text, 'APPLYING'::text, 'ABORTING'::text]))",
    'binding_source_intent:binding_source_intent_pkey:CREATE UNIQUE INDEX binding_source_intent_pkey ON project.binding_source_intent USING btree (intent_id)',
  ])
}

const assert013Catalog = async (
  client,
  migration003,
  migration005,
  migration006,
  migration011,
  migration012,
  migration013,
  { after014 = false, after015 = false, after017 = false, after019 = false } = {},
) => {
  await assert012Catalog(client, migration003, migration005, migration006, migration011, migration012, {
    withR2Concordance: true,
    after014,
    after015,
    after017,
    after019,
  })
  const functionBodies = (await client.query(`
    SELECT n.nspname || '.' || p.proname AS name, p.prosrc AS definition
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'project' AND p.proname = 'get_binding_source_basis'
    ORDER BY name
  `)).rows
  if (JSON.stringify(functionBodies) !== JSON.stringify(expected013FunctionBodies(migration013))) {
    fail('MIGRATION_013_FUNCTION_SOURCE_REFUSED')
  }
  await assertSignatures(client, 'MIGRATION_013_FUNCTION_CENSUS_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' ||
      pg_get_userbyid(p.proowner) || ':' || p.prosecdef AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'project' AND p.proname = 'get_binding_source_basis'
  `, ['project.get_binding_source_basis(uuid, uuid, uuid, bigint):project_owner:true'])
  await assertSignatures(client, 'MIGRATION_013_EXECUTE_PRIVILEGE_REFUSED', `
    WITH roles(role_name) AS (VALUES ('hub_r2_project_binding'), ('project_owner'), ('public'))
    SELECT role_name || ':' || has_function_privilege(
      role_name, 'project.get_binding_source_basis(uuid, uuid, uuid, bigint)', 'EXECUTE'
    ) AS signature
    FROM roles
    WHERE has_function_privilege(role_name, 'project.get_binding_source_basis(uuid, uuid, uuid, bigint)', 'EXECUTE')
    ORDER BY role_name
  `, ['hub_r2_project_binding:true', 'project_owner:true'])
}

const assert014Catalog = async (
  client, migration003, migration005, migration006, migration011, migration012, migration013, migration014,
  { after015 = false, after016 = false, after017 = false, after018 = false, after019 = false } = {},
) => {
  await assert013Catalog(
    client, migration003, migration005, migration006, migration011, migration012, migration013,
    { after014: true, after015, after017, after019 },
  )
  const expectedFunctionBodies = [
    ...expected011FunctionBodies(migration011),
    ...expected012FunctionBodies(migration012).filter(({ name }) =>
      !['project.complete_binding_source_intent', 'project.validate_binding_source_intent'].includes(name)),
    ...expected013FunctionBodies(migration013),
    ...expected014FunctionBodies(migration014).filter(({ name }) =>
      (!after015 || ![
        'brn.persist_binding_validation', 'con.admit_brain_proof_subject',
        'project.prepare_brain_binding',
      ].includes(name)) && (!after016 || ![
        'project.complete_binding_source_intent', 'project.validate_binding_source_intent',
      ].includes(name)) && (!after017 || name !== 'brn.admit_binding_candidate')),
  ].sort((left, right) => left.name.localeCompare(right.name))
  const functionBodies = (await client.query(`
    SELECT n.nspname || '.' || p.proname AS name, p.prosrc AS definition
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('iam','reg','brn','con','project')
      AND n.nspname || '.' || p.proname = ANY($1::text[])
    ORDER BY name
  `, [expectedFunctionBodies.map(({ name }) => name)])).rows
  if (JSON.stringify(functionBodies) !== JSON.stringify(expectedFunctionBodies)) {
    fail('MIGRATION_014_FUNCTION_SOURCE_REFUSED')
  }
  const expectedFunctionNamesSql = expectedFunctionBodies.map(({ name }) => `('${name}')`).join(',')
  await assertSignatures(client, 'MIGRATION_014_FUNCTION_SECURITY_REFUSED', `
    WITH expected(name) AS (VALUES ${expectedFunctionNamesSql})
    SELECT n.nspname || '.' || p.proname AS signature
    FROM expected JOIN pg_proc AS p ON true JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE expected.name = n.nspname || '.' || p.proname
      AND (pg_get_userbyid(p.proowner) IS DISTINCT FROM CASE n.nspname
        WHEN 'iam' THEN 'iam_owner' WHEN 'reg' THEN 'registry_owner'
        WHEN 'brn' THEN 'brain_owner' WHEN 'con' THEN 'connections_owner'
        WHEN 'project' THEN 'project_owner' END
      OR p.prosecdef IS DISTINCT FROM (n.nspname || '.' || p.proname <> 'brn.canonical_binding_json')
      OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']::text[])
    ORDER BY n.nspname, p.proname
  `, [])
  await assertSignatures(client, 'MIGRATION_014_SCHEMA_PRIVILEGE_REFUSED', `
    WITH roles(role_name) AS (VALUES ('hub_iam_runtime'), ('public')),
      schemas(schema_name) AS (VALUES ('reg'), ('brn'), ('con'), ('project'))
    SELECT role_name || ':' || schema_name AS signature FROM roles CROSS JOIN schemas
    WHERE has_schema_privilege(role_name, schema_name, 'USAGE,CREATE')
    ORDER BY role_name, schema_name
  `, [])
  await assertSignatures(client, 'MIGRATION_014_TABLE_CATALOG_REFUSED', `
    SELECT column_name || ':' || udt_name || ':' || is_nullable || ':' || coalesce(column_default, '') AS signature
    FROM information_schema.columns
    WHERE table_schema = 'project' AND table_name = 'binding_source_intent'
    ORDER BY ordinal_position
  `, [
    'intent_id:uuid:NO:',
    'project_id:uuid:NO:',
    'account_id:uuid:NO:',
    'workspace_id:uuid:NO:',
    'connection_id:uuid:YES:',
    'connection_revision_id:uuid:YES:',
    'environment:text:YES:',
    'expected_current:jsonb:NO:',
    'remove_binding:bool:NO:',
    'source_revision:text:NO:',
    'declaration:jsonb:NO:',
    'prepared_result:jsonb:YES:',
    'declaration_digest:text:YES:',
    'base_tree:text:YES:',
    'previous_declaration_blob:text:YES:',
    'apply_source_revision:text:YES:',
    'cancel_base_source_revision:text:YES:',
    'cancel_applied_source_revision:text:YES:',
    "state:text:NO:'PREPARING'::text",
    'version:int8:NO:0',
    'terminal_source_revision:text:YES:',
    'terminal_result:jsonb:YES:',
    'refusal_code:text:YES:',
    'created_at:timestamptz:NO:clock_timestamp()',
    'completed_at:timestamptz:YES:',
    "operation_kind:text:NO:'CONNECTION'::text",
    'brain_revision_id:uuid:YES:',
    'brain_digest:text:YES:',
  ])
  await assertSignatures(client, 'MIGRATION_014_TABLE_CATALOG_REFUSED', `
    SELECT c.relname || ':' || constraint_row.conname || ':' || constraint_row.contype::text || ':' ||
      pg_get_constraintdef(constraint_row.oid, true) AS signature
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS c ON c.oid = constraint_row.conrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'project' AND c.relname = 'binding_source_intent'
    ORDER BY constraint_row.conname
  `, [
    `binding_source_intent:binding_source_intent_apply_source_revision_check:c:CHECK (apply_source_revision ~ '^[0-9a-f]{40}$'::text)`,
    `binding_source_intent:binding_source_intent_base_tree_check:c:CHECK (base_tree ~ '^[0-9a-f]{40}$'::text)`,
    `binding_source_intent:binding_source_intent_brain_digest_check:c:CHECK (brain_digest ~ '^[0-9a-f]{64}$'::text)`,
    `binding_source_intent:binding_source_intent_cancel_applied_source_revision_check:c:CHECK (cancel_applied_source_revision ~ '^[0-9a-f]{40}$'::text)`,
    `binding_source_intent:binding_source_intent_cancel_base_source_revision_check:c:CHECK (cancel_base_source_revision ~ '^[0-9a-f]{40}$'::text)`,
    `binding_source_intent:binding_source_intent_declaration_digest_check:c:CHECK (declaration_digest ~ '^[0-9a-f]{64}$'::text)`,
    `binding_source_intent:binding_source_intent_environment_check:c:CHECK (environment = ANY (ARRAY['SANDBOX'::text, 'PRODUCTION'::text]))`,
    `binding_source_intent:binding_source_intent_frozen:c:CHECK (state = 'PREPARING'::text OR state = 'ABORTED'::text AND declaration_digest IS NULL AND base_tree IS NULL AND previous_declaration_blob IS NULL AND apply_source_revision IS NULL AND cancel_base_source_revision IS NULL AND cancel_applied_source_revision IS NULL OR declaration_digest IS NOT NULL AND base_tree IS NOT NULL AND apply_source_revision IS NOT NULL AND cancel_base_source_revision IS NOT NULL AND cancel_applied_source_revision IS NOT NULL AND source_revision <> apply_source_revision AND source_revision <> cancel_base_source_revision AND source_revision <> cancel_applied_source_revision AND apply_source_revision <> cancel_base_source_revision AND apply_source_revision <> cancel_applied_source_revision AND cancel_base_source_revision <> cancel_applied_source_revision)`,
    `binding_source_intent:binding_source_intent_operation_kind_check:c:CHECK (operation_kind = ANY (ARRAY['CONNECTION'::text, 'BRAIN'::text]))`,
    after016
      ? `binding_source_intent:binding_source_intent_operation_shape:c:CHECK (operation_kind = 'CONNECTION'::text AND connection_id IS NOT NULL AND connection_revision_id IS NOT NULL AND environment IS NOT NULL AND brain_revision_id IS NULL AND brain_digest IS NULL OR operation_kind = 'BRAIN'::text AND connection_id IS NULL AND connection_revision_id IS NULL AND environment IS NULL AND brain_revision_id IS NOT NULL AND brain_digest IS NOT NULL)`
      : `binding_source_intent:binding_source_intent_operation_shape:c:CHECK (operation_kind = 'CONNECTION'::text AND connection_id IS NOT NULL AND connection_revision_id IS NOT NULL AND environment IS NOT NULL AND brain_revision_id IS NULL AND brain_digest IS NULL OR operation_kind = 'BRAIN'::text AND connection_id IS NULL AND connection_revision_id IS NULL AND environment IS NULL AND brain_revision_id IS NOT NULL AND brain_digest IS NOT NULL AND remove_binding = false)`,
    'binding_source_intent:binding_source_intent_pkey:p:PRIMARY KEY (intent_id)',
    `binding_source_intent:binding_source_intent_previous_declaration_blob_check:c:CHECK (previous_declaration_blob ~ '^[0-9a-f]{40}$'::text)`,
    'binding_source_intent:binding_source_intent_project_id_fkey:f:FOREIGN KEY (project_id) REFERENCES project.project(project_id)',
    `binding_source_intent:binding_source_intent_source_revision_check:c:CHECK (source_revision ~ '^[0-9a-f]{40}$'::text)`,
    `binding_source_intent:binding_source_intent_state_check:c:CHECK (state = ANY (ARRAY['PREPARING'::text, 'APPLYING'::text, 'ABORTING'::text, 'COMPLETED'::text, 'ABORTED'::text]))`,
    `binding_source_intent:binding_source_intent_terminal:c:CHECK ((state = ANY (ARRAY['PREPARING'::text, 'APPLYING'::text, 'ABORTING'::text])) AND completed_at IS NULL AND terminal_source_revision IS NULL OR state = 'COMPLETED'::text AND completed_at IS NOT NULL AND terminal_source_revision IS NOT NULL AND terminal_source_revision = apply_source_revision OR state = 'ABORTED'::text AND completed_at IS NOT NULL AND terminal_source_revision IS NOT NULL AND (apply_source_revision IS NULL AND terminal_source_revision = source_revision OR apply_source_revision IS NOT NULL AND (terminal_source_revision = cancel_base_source_revision OR terminal_source_revision = cancel_applied_source_revision)))`,
    `binding_source_intent:binding_source_intent_terminal_source_revision_check:c:CHECK (terminal_source_revision ~ '^[0-9a-f]{40}$'::text)`,
    'binding_source_intent:binding_source_intent_version_check:c:CHECK (version >= 0)',
  ])
  await assertSignatures(client, 'MIGRATION_014_FUNCTION_CENSUS_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' ||
      pg_get_userbyid(p.proowner) || ':' || p.prosecdef || ':' || coalesce(array_to_string(p.proconfig, ','), '') AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('iam','admit_brain_binding'), ('reg','admit_project_brain_revision'),
      ('con','admit_brain_proof_subject'), ('brn','canonical_binding_json'),
      ('brn','admit_binding_candidate'), ('brn','persist_binding_validation'),
      ('brn','admit_binding_validation'),
      ('project','prepare_brain_binding'), ('project','begin_brain_binding_intent'),
      ('project','settle_brain_binding')
      ${after016 ? '' : ", ('project','validate_binding_source_intent'), ('project','complete_binding_source_intent')"})
    ORDER BY n.nspname, p.proname, oidvectortypes(p.proargtypes)
  `, [
    'brn.admit_binding_candidate(jsonb):brain_owner:true:search_path=pg_catalog, pg_temp',
    'brn.admit_binding_validation(uuid, uuid, uuid, text, text, jsonb):brain_owner:true:search_path=pg_catalog, pg_temp',
    'brn.canonical_binding_json(jsonb):brain_owner:false:search_path=pg_catalog, pg_temp',
    'brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb):brain_owner:true:search_path=pg_catalog, pg_temp',
    'con.admit_brain_proof_subject(uuid, uuid, uuid, uuid, uuid, bigint, text):connections_owner:true:search_path=pg_catalog, pg_temp',
    'iam.admit_brain_binding(uuid, uuid):iam_owner:true:search_path=pg_catalog, pg_temp',
    'project.begin_brain_binding_intent(uuid, uuid, uuid, text, jsonb, jsonb, text, uuid):project_owner:true:search_path=pg_catalog, pg_temp',
    ...(!after016 ? ['project.complete_binding_source_intent(uuid, uuid, uuid, bigint):project_owner:true:search_path=pg_catalog, pg_temp'] : []),
    'project.prepare_brain_binding(uuid, uuid, uuid, text, jsonb, jsonb, text, uuid):project_owner:true:search_path=pg_catalog, pg_temp',
    'project.settle_brain_binding(uuid, uuid, uuid, uuid, text, jsonb, text, text, jsonb, text, uuid):project_owner:true:search_path=pg_catalog, pg_temp',
    ...(!after016 ? ['project.validate_binding_source_intent(uuid, uuid, uuid, bigint):project_owner:true:search_path=pg_catalog, pg_temp'] : []),
    'reg.admit_project_brain_revision(uuid, uuid, text, jsonb):registry_owner:true:search_path=pg_catalog, pg_temp',
  ])
  await assertSignatures(client, 'MIGRATION_014_EXECUTE_PRIVILEGE_REFUSED', `
    WITH capabilities(signature) AS (VALUES
      ('project.begin_brain_binding_intent(uuid, uuid, uuid, text, jsonb, jsonb, text, uuid)'),
      ('project.prepare_brain_binding(uuid, uuid, uuid, text, jsonb, jsonb, text, uuid)'),
      ('project.settle_brain_binding(uuid, uuid, uuid, uuid, text, jsonb, text, text, jsonb, text, uuid)'),
      ('brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb)')
    ), roles(role_name) AS (VALUES ('hub_r2_project_binding'),
      ${after015 ? "('hub_r2_brain_attester')," : ''}
      ('hub_r2_brain_bootstrap'), ('project_owner'), ('public'))
    SELECT role_name || ':' || signature AS signature
    FROM roles CROSS JOIN capabilities
    WHERE has_function_privilege(role_name, signature, 'EXECUTE')
    ORDER BY role_name, signature
  `, [
    ...(after015
      ? ['hub_r2_brain_attester:brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb)']
      : ['hub_r2_brain_bootstrap:brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb)']),
    'hub_r2_project_binding:project.begin_brain_binding_intent(uuid, uuid, uuid, text, jsonb, jsonb, text, uuid)',
    'project_owner:project.begin_brain_binding_intent(uuid, uuid, uuid, text, jsonb, jsonb, text, uuid)',
    'project_owner:project.prepare_brain_binding(uuid, uuid, uuid, text, jsonb, jsonb, text, uuid)',
    'project_owner:project.settle_brain_binding(uuid, uuid, uuid, uuid, text, jsonb, text, text, jsonb, text, uuid)',
  ])
  await assertSignatures(client, 'MIGRATION_014_TABLE_PRIVILEGE_REFUSED', `
    WITH roles(role_name) AS (
      SELECT rolname FROM pg_roles WHERE left(rolname, 4) = 'hub_'
      UNION ALL SELECT role_name FROM (VALUES
        ('brain_owner'), ('connections_owner'), ('iam_owner'), ('project_owner'),
        ('registry_owner'), ('workspace_owner'), ('public')) AS owners(role_name)
    ), tables(table_schema, table_name, expected_owner) AS (VALUES
      ('brn','binding_validation','brain_owner'), ('brn','health','brain_owner'),
      ('con','connection','connections_owner'), ('con','connection_revision','connections_owner'),
      ('con','connection_qualification','connections_owner'), ('con','operation_receipt','connections_owner'),
      ('project','brain_binding','project_owner'), ('project','connection_binding','project_owner'),
      ('project','binding_source_intent','project_owner'), ('reg','artifact','registry_owner'),
      ('reg','artifact_revision','registry_owner'))
    SELECT role_name || ':' || table_schema || '.' || table_name AS signature
    FROM roles CROSS JOIN tables
    WHERE role_name <> expected_owner AND has_table_privilege(role_name,
      quote_ident(table_schema) || '.' || quote_ident(table_name),
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    ORDER BY role_name, table_schema, table_name
  `, [])
  await assertSignatures(client, 'MIGRATION_014_RUNTIME_FUNCTION_ACL_REFUSED', `
    WITH allowed(role_name, function_name) AS (VALUES
      ('hub_r2_brain_bootstrap','brn.bootstrap_brain_health'),
      ('hub_r2_brain_bootstrap','reg.bootstrap_workspace_brain'),
      ${after015 ? '' : "('hub_r2_brain_bootstrap','brn.persist_binding_validation'),"}
      ${after015 ? "('hub_r2_brain_attester','brn.persist_binding_validation'),('hub_r2_brain_attester','reg.get_project_brain_candidate')," : ''}
      ('hub_r2_brain_read','brn.get_brain_health'),
      ('hub_r2_brain_read','iam.admit_brain_read'),
      ${after018 ? "('hub_r2_brain_read','iam.admit_brain_revision_selection')," : ''}
      ('hub_r2_brain_read','reg.get_brain_revision'),
      ('hub_r2_brain_read','reg.get_workspace_brain'),
      ('hub_r2_brain_read','reg.list_brain_revisions'),
      ${after015 ? "('hub_r2_brain_read','brn.get_project_brain_basis')," : ''}
      ('hub_r2_connections','con.create_or_replay_connection'),
      ('hub_r2_connections','con.get_connection'),
      ('hub_r2_connections','con.get_connection_qualification'),
      ('hub_r2_connections','con.list_connections'),
      ('hub_r2_connections','con.reserve_connection_credential'),
      ('hub_r2_connections','con.reserve_connection_qualification'),
      ('hub_r2_connections','con.revise_connection'),
      ('hub_r2_connections','con.settle_connection_credential'),
      ('hub_r2_connections','con.settle_connection_qualification'),
      ('hub_r2_connections','iam.admit_any_connection_read'),
      ('hub_r2_project_binding','project.abort_binding_source_intent'),
      ('hub_r2_project_binding','project.begin_brain_binding_intent'),
      ${after016 ? "('hub_r2_project_binding','project.begin_brain_binding_removal_intent')," : ''}
      ('hub_r2_project_binding','project.begin_connection_binding_intent'),
      ('hub_r2_project_binding','project.complete_binding_source_abort'),
      ('hub_r2_project_binding','project.complete_binding_source_intent'),
      ('hub_r2_project_binding','project.freeze_binding_source_intent'),
      ('hub_r2_project_binding','project.get_binding_source_basis'),
      ('hub_r2_project_binding','project.get_binding_source_intent'),
      ('hub_r2_project_binding','project.list_connection_bindings'),
      ('hub_r2_project_binding','project.prepare_connection_binding'),
      ('hub_r2_project_binding','project.validate_binding_source_intent')
      ${after015 ? ",('hub_r2_project_binding','project.admit_brain_binding_preflight'),('hub_r2_project_binding','project.get_project_brain_binding')" : ''}),
    runtime(role_name) AS (VALUES
      ${after015 ? "('hub_r2_brain_attester')," : ''}
      ('hub_r2_brain_bootstrap'), ('hub_r2_brain_read'),
      ('hub_r2_connections'), ('hub_r2_project_binding'))
    SELECT runtime.role_name || ':' || n.nspname || '.' || p.proname AS signature
    FROM runtime CROSS JOIN pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('iam','workspace','project','reg','brn','con')
      AND has_function_privilege(runtime.role_name, p.oid, 'EXECUTE')
    ORDER BY runtime.role_name, n.nspname, p.proname
  `, [
    ...(after015 ? [
      'hub_r2_brain_attester:brn.persist_binding_validation',
      'hub_r2_brain_attester:reg.get_project_brain_candidate',
    ] : []),
    'hub_r2_brain_bootstrap:brn.bootstrap_brain_health',
    ...(after015 ? [] : ['hub_r2_brain_bootstrap:brn.persist_binding_validation']),
    'hub_r2_brain_bootstrap:reg.bootstrap_workspace_brain',
    'hub_r2_brain_read:brn.get_brain_health',
    ...(after015 ? ['hub_r2_brain_read:brn.get_project_brain_basis'] : []),
    'hub_r2_brain_read:iam.admit_brain_read',
    ...(after018 ? ['hub_r2_brain_read:iam.admit_brain_revision_selection'] : []),
    'hub_r2_brain_read:reg.get_brain_revision',
    'hub_r2_brain_read:reg.get_workspace_brain',
    'hub_r2_brain_read:reg.list_brain_revisions',
    'hub_r2_connections:con.create_or_replay_connection',
    'hub_r2_connections:con.get_connection',
    'hub_r2_connections:con.get_connection_qualification',
    'hub_r2_connections:con.list_connections',
    'hub_r2_connections:con.reserve_connection_credential',
    'hub_r2_connections:con.reserve_connection_qualification',
    'hub_r2_connections:con.revise_connection',
    'hub_r2_connections:con.settle_connection_credential',
    'hub_r2_connections:con.settle_connection_qualification',
    'hub_r2_connections:iam.admit_any_connection_read',
    'hub_r2_project_binding:project.abort_binding_source_intent',
    ...(after015 ? ['hub_r2_project_binding:project.admit_brain_binding_preflight'] : []),
    'hub_r2_project_binding:project.begin_brain_binding_intent',
    ...(after016 ? ['hub_r2_project_binding:project.begin_brain_binding_removal_intent'] : []),
    'hub_r2_project_binding:project.begin_connection_binding_intent',
    'hub_r2_project_binding:project.complete_binding_source_abort',
    'hub_r2_project_binding:project.complete_binding_source_intent',
    'hub_r2_project_binding:project.freeze_binding_source_intent',
    'hub_r2_project_binding:project.get_binding_source_basis',
    'hub_r2_project_binding:project.get_binding_source_intent',
    ...(after015 ? ['hub_r2_project_binding:project.get_project_brain_binding'] : []),
    'hub_r2_project_binding:project.list_connection_bindings',
    'hub_r2_project_binding:project.prepare_connection_binding',
    'hub_r2_project_binding:project.validate_binding_source_intent',
  ])
  await assertSignatures(client, 'MIGRATION_014_RLS_TRIGGER_REFUSED', `
    SELECT n.nspname || '.' || c.relname AS signature
    FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('iam','workspace','project','reg','brn','con')
      AND c.relkind IN ('r','p') AND (c.relrowsecurity OR c.relforcerowsecurity)
    ORDER BY n.nspname, c.relname
  `, [])
  await assertSignatures(client, 'MIGRATION_014_RLS_TRIGGER_REFUSED', `
    SELECT n.nspname || '.' || c.relname || ':' || trigger_row.tgname || ':' ||
      function_namespace.nspname || '.' || function_row.proname AS signature
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS c ON c.oid = trigger_row.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_proc AS function_row ON function_row.oid = trigger_row.tgfoid
    JOIN pg_namespace AS function_namespace ON function_namespace.oid = function_row.pronamespace
    WHERE n.nspname IN ('iam','workspace','project','reg','brn','con') AND NOT trigger_row.tgisinternal
    ORDER BY n.nspname, c.relname, trigger_row.tgname
  `, ['project.inception_idempotency:inception_binding_source_guard:project.guard_inception_binding_source'])
}

const assert015Catalog = async (
  client, migration003, migration005, migration006, migration011, migration012, migration013, migration014, migration015,
  { after016 = false, after017 = false, after018 = false, after019 = false } = {},
) => {
  await assert014Catalog(
    client, migration003, migration005, migration006, migration011, migration012, migration013, migration014,
    { after015: true, after016, after017, after018, after019 },
  )
  const expectedFunctionBodies = expected015FunctionBodies(migration015).filter(({ name }) =>
    !after016 || !['project.complete_binding_source_intent', 'project.validate_binding_source_intent'].includes(name))
  const functionBodies = (await client.query(`
    SELECT n.nspname || '.' || p.proname AS name, p.prosrc AS definition
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('iam','reg','brn','con','project')
      AND n.nspname || '.' || p.proname = ANY($1::text[])
    ORDER BY name
  `, [expectedFunctionBodies.map(({ name }) => name)])).rows
  if (JSON.stringify(functionBodies) !== JSON.stringify(expectedFunctionBodies)) {
    fail('MIGRATION_015_FUNCTION_SOURCE_REFUSED')
  }
  await assertSignatures(client, 'MIGRATION_015_FUNCTION_CENSUS_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' ||
      pg_get_userbyid(p.proowner) || ':' || p.prosecdef || ':' ||
      coalesce(array_to_string(p.proconfig, ','), '') AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('brn','get_project_binding_attestation'), ('brn','get_project_brain_basis'),
      ('brn','persist_binding_validation'),
      ('con','admit_brain_proof_subject'),
      ('iam','admit_project_brain_context'),
      ('project','admit_brain_binding_preflight'),
      ('project','get_project_brain_binding'),
      ('project','get_project_brain_read_basis'),
      ('project','prepare_brain_binding'),
      ('reg','get_project_binding_update'), ('reg','get_project_brain_candidate'),
      ('reg','get_project_brain_snapshot'))
    ORDER BY n.nspname, p.proname, oidvectortypes(p.proargtypes)
  `, [
    'brn.get_project_binding_attestation(uuid, uuid, text, text):brain_owner:true:search_path=pg_catalog, pg_temp',
    'brn.get_project_brain_basis(uuid, uuid):brain_owner:true:search_path=pg_catalog, pg_temp',
    'brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb):brain_owner:true:search_path=pg_catalog, pg_temp',
    'con.admit_brain_proof_subject(uuid, uuid, uuid, uuid, uuid, bigint, text):connections_owner:true:search_path=pg_catalog, pg_temp',
    'iam.admit_project_brain_context(uuid, uuid):iam_owner:true:search_path=pg_catalog, pg_temp',
    'project.admit_brain_binding_preflight(uuid, uuid):project_owner:true:search_path=pg_catalog, pg_temp',
    'project.get_project_brain_binding(uuid, uuid):project_owner:true:search_path=pg_catalog, pg_temp',
    'project.get_project_brain_read_basis(uuid, uuid[]):project_owner:true:search_path=pg_catalog, pg_temp',
    'project.prepare_brain_binding(uuid, uuid, uuid, text, jsonb, jsonb, text, uuid):project_owner:true:search_path=pg_catalog, pg_temp',
    'reg.get_project_binding_update(uuid, uuid):registry_owner:true:search_path=pg_catalog, pg_temp',
    'reg.get_project_brain_candidate(uuid, uuid):registry_owner:true:search_path=pg_catalog, pg_temp',
    'reg.get_project_brain_snapshot(uuid, uuid, text):registry_owner:true:search_path=pg_catalog, pg_temp',
  ])
  await assertRowsDigest(client, 'MIGRATION_015_CUMULATIVE_FUNCTION_CENSUS_REFUSED', `
    SELECT n.nspname AS schema_name, p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      pg_get_userbyid(p.proowner) AS owner_name, p.prokind::text AS function_kind
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('iam','workspace','project','reg','brn','con')
      ${after016 ? "AND NOT (n.nspname = 'project' AND p.proname IN ('begin_brain_binding_removal_intent','prepare_brain_binding_removal','settle_brain_binding_removal'))" : ''}
      ${after017 ? "AND NOT ((n.nspname = 'project' OR n.nspname = 'con') AND p.proname = 'resolve_key_conformance_subject')" : ''}
      ${after018 ? "AND NOT (n.nspname = 'iam' AND p.proname = 'admit_brain_revision_selection')" : ''}
      ${after019 ? "AND NOT (n.nspname = 'iam' AND p.proname IN ('admit_project_build','admit_project_source_read','ensure_project_builder_grant'))" : ''}
    ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  `, 'c0686086aaa82af22c1774be61d4a02dfffcceb1a09ec8e7ac41670474023563')
  await assertSignatures(client, 'MIGRATION_015_EXECUTE_PRIVILEGE_REFUSED', `
    WITH capabilities(role_name, function_name) AS (VALUES
      ('brain_owner','iam.admit_project_brain_context(uuid, uuid)'),
      ('brain_owner','project.get_project_brain_read_basis(uuid, uuid[])'),
      ('brain_owner','reg.get_project_brain_snapshot(uuid, uuid, text)'),
      ('brain_owner','brn.get_project_binding_attestation(uuid, uuid, text, text)'),
      ('brain_owner','brn.get_project_brain_basis(uuid, uuid)'),
      ('project_owner','reg.get_project_binding_update(uuid, uuid)'),
      ('project_owner','project.get_project_brain_binding(uuid, uuid)'),
      ('project_owner','project.admit_brain_binding_preflight(uuid, uuid)'),
      ('project_owner','project.get_project_brain_read_basis(uuid, uuid[])'),
      ('hub_r2_brain_attester','reg.get_project_brain_candidate(uuid, uuid)'),
      ('hub_r2_brain_attester','brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb)'),
      ('hub_r2_brain_read','brn.get_project_brain_basis(uuid, uuid)'),
      ('hub_r2_project_binding','project.get_project_brain_binding(uuid, uuid)'),
      ('hub_r2_project_binding','project.admit_brain_binding_preflight(uuid, uuid)'))
    SELECT role_name || ':' || function_name AS signature
    FROM capabilities
    WHERE NOT has_function_privilege(role_name, function_name, 'EXECUTE')
    ORDER BY role_name, function_name
  `, [])
  await assertSignatures(client, 'MIGRATION_015_EXECUTE_PRIVILEGE_REFUSED', `
    WITH capabilities(function_name, allowed_role) AS (VALUES
      ('reg.bootstrap_workspace_brain(uuid, uuid, uuid, text, text, jsonb)','hub_r2_brain_bootstrap'),
      ('reg.get_project_brain_candidate(uuid, uuid)','hub_r2_brain_attester'),
      ('brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb)','hub_r2_brain_attester'),
      ('iam.admit_brain_read(uuid, uuid)','hub_r2_brain_read'),
      ('brn.get_project_brain_basis(uuid, uuid)','hub_r2_brain_read'),
      ('project.get_project_brain_binding(uuid, uuid)','hub_r2_project_binding'),
      ('project.admit_brain_binding_preflight(uuid, uuid)','hub_r2_project_binding'),
      ('project.get_project_representation(uuid, uuid[])','hub_s3_read'),
      ('workspace.list_workspace_summaries(uuid[])','hub_s2_read'))
    SELECT capabilities.function_name || ':' || coalesce(grantee.rolname, 'public') || ':' ||
      acl.privilege_type || ':' || acl.is_grantable AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    JOIN capabilities ON capabilities.function_name =
      n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE acl.privilege_type = 'EXECUTE' AND acl.grantee <> p.proowner
      AND grantee.rolname IS DISTINCT FROM capabilities.allowed_role
    ORDER BY capabilities.function_name, grantee.rolname
  `, [])
  await assertSignatures(client, 'MIGRATION_015_EXECUTE_GRANT_OPTION_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' ||
      coalesce(grantee.rolname, 'public') || ':' ||
      acl.privilege_type || ':' || acl.is_grantable AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE n.nspname IN ('iam','workspace','project','reg','brn','con')
      AND acl.privilege_type = 'EXECUTE'
      AND acl.is_grantable
      AND acl.grantee <> p.proowner
    ORDER BY n.nspname, p.proname, oidvectortypes(p.proargtypes), grantee.rolname
  `, [])
  await assertSignatures(client, 'MIGRATION_015_SCHEMA_PRIVILEGE_REFUSED', `
    WITH roles(role_name) AS (VALUES
      ('hub_r2_brain_attester'),
      ('hub_r2_brain_bootstrap'), ('hub_r2_brain_read'),
      ('hub_r2_connections'), ('hub_r2_project_binding')),
    schemas(schema_name) AS (VALUES ('iam'), ('workspace'), ('project'), ('reg'), ('brn'), ('con'))
    SELECT roles.role_name || ':' || schemas.schema_name || ':' ||
      has_schema_privilege(roles.role_name, schemas.schema_name, 'USAGE') || ':' ||
      has_schema_privilege(roles.role_name, schemas.schema_name, 'CREATE') AS signature
    FROM roles CROSS JOIN schemas
    ORDER BY roles.role_name, schemas.schema_name
  `, [
    'hub_r2_brain_attester:brn:true:false', 'hub_r2_brain_attester:con:false:false',
    'hub_r2_brain_attester:iam:false:false', 'hub_r2_brain_attester:project:false:false',
    'hub_r2_brain_attester:reg:true:false', 'hub_r2_brain_attester:workspace:false:false',
    'hub_r2_brain_bootstrap:brn:true:false', 'hub_r2_brain_bootstrap:con:false:false',
    'hub_r2_brain_bootstrap:iam:false:false', 'hub_r2_brain_bootstrap:project:false:false',
    'hub_r2_brain_bootstrap:reg:true:false', 'hub_r2_brain_bootstrap:workspace:false:false',
    'hub_r2_brain_read:brn:true:false', 'hub_r2_brain_read:con:false:false',
    'hub_r2_brain_read:iam:true:false', 'hub_r2_brain_read:project:false:false',
    'hub_r2_brain_read:reg:true:false', 'hub_r2_brain_read:workspace:false:false',
    'hub_r2_connections:brn:false:false', 'hub_r2_connections:con:true:false',
    'hub_r2_connections:iam:true:false', 'hub_r2_connections:project:false:false',
    'hub_r2_connections:reg:false:false', 'hub_r2_connections:workspace:false:false',
    'hub_r2_project_binding:brn:false:false', 'hub_r2_project_binding:con:false:false',
    'hub_r2_project_binding:iam:false:false', 'hub_r2_project_binding:project:true:false',
    'hub_r2_project_binding:reg:false:false', 'hub_r2_project_binding:workspace:false:false',
  ])
  await assertSignatures(client, 'MIGRATION_015_SCHEMA_PRIVILEGE_REFUSED', `
    WITH schemas(schema_name) AS (VALUES ('iam'), ('workspace'), ('project'), ('reg'), ('brn'), ('con'))
    SELECT schemas.schema_name || ':' || has_schema_privilege('hub_s3_read', schemas.schema_name, 'USAGE') || ':' ||
      has_schema_privilege('hub_s3_read', schemas.schema_name, 'CREATE') AS signature
    FROM schemas ORDER BY schemas.schema_name
  `, [
    'brn:false:false', 'con:false:false', 'iam:true:false',
    'project:true:false', 'reg:false:false', 'workspace:false:false',
  ])
  await assertSignatures(client, 'MIGRATION_015_TABLE_PRIVILEGE_REFUSED', `
    WITH tables(table_schema, table_name) AS (VALUES
      ('brn','binding_validation'), ('brn','health'),
      ('con','connection'), ('con','connection_revision'),
      ('con','connection_qualification'), ('con','operation_receipt'),
      ('project','brain_binding'), ('project','connection_binding'),
      ('project','binding_source_intent'), ('project','project'),
      ('reg','artifact'), ('reg','artifact_revision'),
      ('workspace','workspace')),
    allowed(object_name, role_name, privilege_type) AS (VALUES
      ('project.project','connections_owner','REFERENCES'),
      ('project.project','iam_owner','REFERENCES'),
      ${after019 ? "('project.project','builder_owner','REFERENCES')," : ''}
      ('workspace.workspace','connections_owner','REFERENCES'),
      ('workspace.workspace','iam_owner','REFERENCES'),
      ('workspace.workspace','project_owner','REFERENCES'),
      ('workspace.workspace','registry_owner','REFERENCES'))
    SELECT n.nspname || '.' || c.relname || ':' || coalesce(grantee.rolname, 'public') || ':' ||
      acl.privilege_type || ':' || acl.is_grantable AS signature
    FROM tables
    JOIN pg_namespace AS n ON n.nspname = tables.table_schema
    JOIN pg_class AS c ON c.relnamespace = n.oid AND c.relname = tables.table_name
    CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE acl.grantee <> c.relowner AND NOT EXISTS (
      SELECT 1 FROM allowed
      WHERE allowed.object_name = n.nspname || '.' || c.relname
        AND allowed.role_name = grantee.rolname
        AND allowed.privilege_type = acl.privilege_type
        AND NOT acl.is_grantable)
    ORDER BY n.nspname, c.relname, grantee.rolname, acl.privilege_type
  `, [])
  await assertSignatures(client, 'MIGRATION_015_TABLE_PRIVILEGE_REFUSED', `
    WITH allowed(object_name, role_name, privilege_type) AS (VALUES
      ('iam.account','hub_iam_runtime','INSERT'),
      ('iam.account','hub_iam_runtime','SELECT'),
      ('iam.account','hub_iam_runtime','UPDATE'),
      ('iam.account_project_grant','project_owner','SELECT'),
      ('iam.bootstrap_context','hub_iam_runtime','INSERT'),
      ('iam.bootstrap_context','hub_iam_runtime','SELECT'),
      ('iam.bootstrap_context','hub_iam_runtime','UPDATE'),
      ('iam.oidc_transaction','hub_iam_runtime','INSERT'),
      ('iam.oidc_transaction','hub_iam_runtime','SELECT'),
      ('iam.oidc_transaction','hub_iam_runtime','UPDATE'),
      ('iam.operation_idempotency','hub_iam_runtime','INSERT'),
      ('iam.operation_idempotency','hub_iam_runtime','SELECT'),
      ('iam.operation_idempotency','hub_iam_runtime','UPDATE'),
      ('iam.schema_migration','hub_iam_runtime','SELECT'),
      ('iam.session','hub_iam_runtime','INSERT'),
      ('iam.session','hub_iam_runtime','SELECT'),
      ('iam.session','hub_iam_runtime','UPDATE'))
    SELECT 'iam.' || c.relname || ':' || coalesce(grantee.rolname, 'public') || ':' ||
      acl.privilege_type || ':' || acl.is_grantable AS signature
    FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE n.nspname = 'iam' AND c.relkind IN ('r', 'p') AND acl.grantee <> c.relowner
      AND NOT EXISTS (
        SELECT 1 FROM allowed
        WHERE allowed.object_name = 'iam.' || c.relname
          AND allowed.role_name = grantee.rolname
          AND allowed.privilege_type = acl.privilege_type
          AND NOT acl.is_grantable)
    ORDER BY c.relname, grantee.rolname, acl.privilege_type
  `, [])
  await assertSignatures(client, 'MIGRATION_015_TABLE_PRIVILEGE_REFUSED', `
    WITH allowed(object_name, role_name, privilege_type) AS (VALUES
      ('project.project.project_id','iam_owner','SELECT'),
      ('project.project.workspace_id','iam_owner','SELECT'))
    SELECT n.nspname || '.' || c.relname || '.' || attribute.attname || ':' ||
      coalesce(grantee.rolname, 'public') || ':' || acl.privilege_type || ':' || acl.is_grantable AS signature
    FROM pg_attribute AS attribute
    JOIN pg_class AS c ON c.oid = attribute.attrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(attribute.attacl) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE n.nspname IN ('iam','workspace','project','reg','brn','con')
      AND c.relkind IN ('r', 'p') AND attribute.attnum > 0 AND NOT attribute.attisdropped
      AND acl.grantee <> c.relowner AND NOT EXISTS (
        SELECT 1 FROM allowed
        WHERE allowed.object_name = n.nspname || '.' || c.relname || '.' || attribute.attname
          AND allowed.role_name = grantee.rolname
          AND allowed.privilege_type = acl.privilege_type
          AND NOT acl.is_grantable)
    ORDER BY n.nspname, c.relname, attribute.attname, grantee.rolname, acl.privilege_type
  `, [])
  await assertSignatures(client, 'MIGRATION_015_EXTERNAL_PRINCIPAL_ACL_REFUSED', `
    WITH known_principal(role_name) AS (VALUES
      ('hub_iam_runtime'), ('hub_prj03_command'), ('hub_r2_brain_bootstrap'), ('hub_r2_brain_read'),
      ('hub_r2_brain_attester'), ('hub_r2_connections'), ('hub_r2_project_binding'),
      ${after017 ? "('hub_r2_key_conformance_subject')," : ''}
      ${after019 ? "('hub_rb_executor'), ('hub_rb_ingress'), ('builder_owner')," : ''}
      ('hub_s2_read'), ('hub_s3_read'), ('hub_s4_baseline_command'), ('hub_s4_baseline_read'),
      ('hub_s6_inception_command'), ('hub_ws01_command'),
      ('brain_owner'), ('connections_owner'), ('iam_owner'), ('project_owner'),
      ('registry_owner'), ('workspace_owner')
    ), acl_entries AS (
      SELECT 'schema' AS object_kind, n.nspname AS schema_name, n.nspname AS object_identity,
        n.nspowner AS owner_oid, acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_namespace AS n CROSS JOIN LATERAL aclexplode(n.nspacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
      UNION ALL
      SELECT 'table', n.nspname, c.relname, c.relowner, acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
        AND c.relkind IN ('r', 'p')
      UNION ALL
      SELECT 'column', n.nspname, c.relname || '.' || a.attname, c.relowner,
        acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_attribute AS a JOIN pg_class AS c ON c.oid = a.attrelid
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
        AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
      UNION ALL
      SELECT 'function', n.nspname, p.proname || '(' || oidvectortypes(p.proargtypes) || ')',
        p.proowner, acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(p.proacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
    )
    SELECT acl_entries.object_kind || ':' || acl_entries.schema_name || ':' || acl_entries.object_identity || ':' ||
      coalesce(grantee.rolname, 'public') || ':' || acl_entries.privilege_type || ':' || acl_entries.is_grantable AS signature
    FROM acl_entries LEFT JOIN pg_roles AS grantee ON grantee.oid = acl_entries.grantee
    WHERE acl_entries.grantee <> acl_entries.owner_oid AND (
      acl_entries.is_grantable
      OR NOT EXISTS (SELECT 1 FROM known_principal WHERE known_principal.role_name = grantee.rolname)
    )
    ORDER BY acl_entries.object_kind, acl_entries.schema_name, acl_entries.object_identity,
      grantee.rolname, acl_entries.privilege_type
  `, [])
  await assertRowsDigest(client, 'MIGRATION_015_RUNTIME_ACL_CENSUS_REFUSED', `
    WITH acl_entries AS (
      SELECT 'schema' AS object_kind, n.nspname AS schema_name, n.nspname AS object_identity,
        n.nspowner AS owner_oid, acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_namespace AS n CROSS JOIN LATERAL aclexplode(n.nspacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
      UNION ALL
      SELECT 'table', n.nspname, c.relname, c.relowner, acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con') AND c.relkind IN ('r', 'p')
      UNION ALL
      SELECT 'column', n.nspname, c.relname || '.' || a.attname, c.relowner,
        acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_attribute AS a JOIN pg_class AS c ON c.oid = a.attrelid
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con') AND c.relkind IN ('r', 'p')
        AND a.attnum > 0 AND NOT a.attisdropped
      UNION ALL
      SELECT 'function', n.nspname, p.proname || '(' || oidvectortypes(p.proargtypes) || ')',
        p.proowner, acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(p.proacl) AS acl
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'reg', 'brn', 'con')
    )
    SELECT object_kind, schema_name, object_identity, grantee.rolname AS grantee,
      privilege_type, is_grantable
    FROM acl_entries JOIN pg_roles AS grantee ON grantee.oid = acl_entries.grantee
    WHERE acl_entries.grantee <> acl_entries.owner_oid
      ${after016 ? "AND NOT (object_kind = 'function' AND schema_name = 'project' AND object_identity = 'begin_brain_binding_removal_intent(uuid, uuid, jsonb, uuid)')" : ''}
      ${after017 ? `AND NOT (
        (object_kind = 'function' AND object_identity IN (
          'resolve_key_conformance_subject(uuid, uuid, uuid)',
          'resolve_key_conformance_subject(uuid, uuid, uuid, uuid, uuid, text)'))
        OR (object_kind = 'schema' AND schema_name = 'project'
          AND grantee.rolname = 'hub_r2_key_conformance_subject'))` : ''}
      ${after018 ? `AND NOT (object_kind = 'function' AND schema_name = 'iam'
        AND object_identity = 'admit_brain_revision_selection(uuid, uuid, uuid)'
        AND grantee.rolname = 'hub_r2_brain_read')` : ''}
      ${after019 ? "AND grantee.rolname <> 'builder_owner'" : ''}
    ORDER BY object_kind, schema_name, object_identity, grantee.rolname, privilege_type
  `, 'cda16be172fd2da01af4c128a70820289ee32d644139149de669f2ed754e94db')
  await assertSignatures(client, 'MIGRATION_015_DEFAULT_ACL_REFUSED', `
    SELECT owner.rolname || ':' || coalesce(namespace.nspname, '') || ':' ||
      acl.defaclobjtype::text || ':' || coalesce(grantee.rolname, 'public') || ':' ||
      exploded.privilege_type || ':' || exploded.is_grantable AS signature
    FROM pg_default_acl AS acl
    JOIN pg_roles AS owner ON owner.oid = acl.defaclrole
    LEFT JOIN pg_namespace AS namespace ON namespace.oid = acl.defaclnamespace
    CROSS JOIN LATERAL aclexplode(acl.defaclacl) AS exploded
    LEFT JOIN pg_roles AS grantee ON grantee.oid = exploded.grantee
    WHERE owner.rolname IN ('brain_owner', 'connections_owner', 'iam_owner', 'project_owner',
        'registry_owner', 'workspace_owner')
      AND (acl.defaclnamespace = 0 OR namespace.nspname IN ('iam','workspace','project','reg','brn','con'))
      AND exploded.grantee <> acl.defaclrole
    ORDER BY owner.rolname, namespace.nspname, acl.defaclobjtype, grantee.rolname,
      exploded.privilege_type
  `, [])
  await assertSignatures(client, 'MIGRATION_015_ROLE_MEMBERSHIP_REFUSED', `
    SELECT granted.rolname || ':' || member.rolname AS signature
    FROM pg_auth_members AS membership
    JOIN pg_roles AS granted ON granted.oid = membership.roleid
    JOIN pg_roles AS member ON member.oid = membership.member
    WHERE granted.rolname LIKE 'hub\\_%' ESCAPE '\\' OR member.rolname LIKE 'hub\\_%' ESCAPE '\\'
      OR granted.rolname IN ('brain_owner', 'connections_owner', 'iam_owner', 'project_owner',
        'registry_owner', 'workspace_owner')
      OR member.rolname IN ('brain_owner', 'connections_owner', 'iam_owner', 'project_owner',
        'registry_owner', 'workspace_owner')
    ORDER BY granted.rolname, member.rolname
  `, [])
  await assertSignatures(client, 'MIGRATION_015_RUNTIME_FUNCTION_ACL_REFUSED', `
    WITH allowed(role_name, function_name) AS (VALUES
      ('hub_r2_brain_attester','brn.persist_binding_validation'),
      ('hub_r2_brain_attester','reg.get_project_brain_candidate'),
      ('hub_r2_brain_bootstrap','brn.bootstrap_brain_health'),
      ('hub_r2_brain_bootstrap','reg.bootstrap_workspace_brain'),
      ('hub_r2_brain_read','brn.get_brain_health'),
      ('hub_r2_brain_read','brn.get_project_brain_basis'),
      ('hub_r2_brain_read','iam.admit_brain_read'),
      ${after018 ? "('hub_r2_brain_read','iam.admit_brain_revision_selection')," : ''}
      ('hub_r2_brain_read','reg.get_brain_revision'),
      ('hub_r2_brain_read','reg.get_workspace_brain'),
      ('hub_r2_brain_read','reg.list_brain_revisions'),
      ('hub_r2_connections','con.create_or_replay_connection'),
      ('hub_r2_connections','con.get_connection'),
      ('hub_r2_connections','con.get_connection_qualification'),
      ('hub_r2_connections','con.list_connections'),
      ('hub_r2_connections','con.reserve_connection_credential'),
      ('hub_r2_connections','con.reserve_connection_qualification'),
      ('hub_r2_connections','con.revise_connection'),
      ('hub_r2_connections','con.settle_connection_credential'),
      ('hub_r2_connections','con.settle_connection_qualification'),
      ('hub_r2_connections','iam.admit_any_connection_read'),
      ('hub_r2_project_binding','project.abort_binding_source_intent'),
      ('hub_r2_project_binding','project.admit_brain_binding_preflight'),
      ('hub_r2_project_binding','project.begin_brain_binding_intent'),
      ${after016 ? "('hub_r2_project_binding','project.begin_brain_binding_removal_intent')," : ''}
      ('hub_r2_project_binding','project.begin_connection_binding_intent'),
      ('hub_r2_project_binding','project.complete_binding_source_abort'),
      ('hub_r2_project_binding','project.complete_binding_source_intent'),
      ('hub_r2_project_binding','project.freeze_binding_source_intent'),
      ('hub_r2_project_binding','project.get_binding_source_basis'),
      ('hub_r2_project_binding','project.get_binding_source_intent'),
      ('hub_r2_project_binding','project.get_project_brain_binding'),
      ('hub_r2_project_binding','project.list_connection_bindings'),
      ('hub_r2_project_binding','project.prepare_connection_binding'),
      ('hub_r2_project_binding','project.validate_binding_source_intent')),
    runtime(role_name) AS (VALUES
      ('hub_r2_brain_attester'),
      ('hub_r2_brain_bootstrap'), ('hub_r2_brain_read'),
      ('hub_r2_connections'), ('hub_r2_project_binding'))
    SELECT runtime.role_name || ':' || n.nspname || '.' || p.proname AS signature
    FROM runtime CROSS JOIN pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('iam','workspace','project','reg','brn','con')
      AND has_function_privilege(runtime.role_name, p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM allowed
        WHERE allowed.role_name = runtime.role_name
          AND allowed.function_name = n.nspname || '.' || p.proname)
    ORDER BY runtime.role_name, n.nspname, p.proname
  `, [])
}

const assert016Catalog = async (client, migration016) => {
  const expectedFunctionBodies = expected016FunctionBodies(migration016)
  const functionBodies = (await client.query(`
    SELECT n.nspname || '.' || p.proname AS name, p.prosrc AS definition
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname || '.' || p.proname = ANY($1::text[])
    ORDER BY name
  `, [expectedFunctionBodies.map(({ name }) => name)])).rows
  if (JSON.stringify(functionBodies) !== JSON.stringify(expectedFunctionBodies)) {
    fail('MIGRATION_016_FUNCTION_SOURCE_REFUSED')
  }
  await assertSignatures(client, 'MIGRATION_016_FUNCTION_SECURITY_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' ||
      pg_get_userbyid(p.proowner) || ':' || p.prosecdef || ':' ||
      coalesce(array_to_string(p.proconfig, ','), '') AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'project' AND p.proname IN (
      'begin_brain_binding_removal_intent', 'prepare_brain_binding_removal',
      'settle_brain_binding_removal')
    ORDER BY p.proname
  `, [
    'project.begin_brain_binding_removal_intent(uuid, uuid, jsonb, uuid):project_owner:true:search_path=pg_catalog, pg_temp',
    'project.prepare_brain_binding_removal(uuid, uuid, jsonb):project_owner:true:search_path=pg_catalog, pg_temp',
    'project.settle_brain_binding_removal(uuid, uuid, jsonb, text, text, jsonb, text):project_owner:true:search_path=pg_catalog, pg_temp',
  ])
  await assertSignatures(client, 'MIGRATION_016_EXECUTE_PRIVILEGE_REFUSED', `
    WITH roles(role_name) AS (VALUES ('hub_r2_project_binding'), ('public'))
    SELECT role_name || ':' || p.proname AS signature
    FROM roles CROSS JOIN pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'project' AND p.proname IN (
      'begin_brain_binding_removal_intent', 'prepare_brain_binding_removal',
      'settle_brain_binding_removal')
      AND has_function_privilege(role_name, p.oid, 'EXECUTE')
    ORDER BY role_name, p.proname
  `, ['hub_r2_project_binding:begin_brain_binding_removal_intent'])
  await assertSignatures(client, 'MIGRATION_016_TABLE_PRIVILEGE_REFUSED', `
    SELECT table_schema || '.' || table_name || ':' || privilege_type AS signature
    FROM information_schema.table_privileges
    WHERE grantee = 'hub_r2_project_binding'
      AND table_schema IN ('iam','workspace','project','reg','brn','con')
    ORDER BY table_schema, table_name, privilege_type
  `, [])
  await assertSignatures(client, 'MIGRATION_016_OPERATION_SHAPE_REFUSED', `
    SELECT pg_get_constraintdef(c.oid, true) AS signature
    FROM pg_constraint AS c JOIN pg_class AS r ON r.oid = c.conrelid
    JOIN pg_namespace AS n ON n.oid = r.relnamespace
    WHERE n.nspname = 'project' AND r.relname = 'binding_source_intent'
      AND c.conname = 'binding_source_intent_operation_shape'
  `, ["CHECK (operation_kind = 'CONNECTION'::text AND connection_id IS NOT NULL AND connection_revision_id IS NOT NULL AND environment IS NOT NULL AND brain_revision_id IS NULL AND brain_digest IS NULL OR operation_kind = 'BRAIN'::text AND connection_id IS NULL AND connection_revision_id IS NULL AND environment IS NULL AND brain_revision_id IS NOT NULL AND brain_digest IS NOT NULL)"])
}

const assert017Catalog = async (client, migration017) => {
  const expectedFunctionBodies = expected017FunctionBodies(migration017)
  const functionBodies = (await client.query(`
    SELECT n.nspname || '.' || p.proname AS name, p.prosrc AS definition
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname || '.' || p.proname = ANY($1::text[])
    ORDER BY name
  `, [expectedFunctionBodies.map(({ name }) => name)])).rows
  if (JSON.stringify(functionBodies) !== JSON.stringify(expectedFunctionBodies)) {
    fail('MIGRATION_017_FUNCTION_SOURCE_REFUSED')
  }
  await assertSignatures(client, 'MIGRATION_017_FUNCTION_SECURITY_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' ||
      pg_get_userbyid(p.proowner) || ':' || p.prosecdef || ':' || p.provolatile::text || ':' ||
      coalesce(array_to_string(p.proconfig, ','), '') AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('con', 'resolve_key_conformance_subject'),
      ('project', 'resolve_key_conformance_subject'))
    ORDER BY n.nspname, p.proname
  `, [
    'con.resolve_key_conformance_subject(uuid, uuid, uuid, uuid, uuid, text):connections_owner:true:v:search_path=pg_catalog, pg_temp',
    'project.resolve_key_conformance_subject(uuid, uuid, uuid):project_owner:true:v:search_path=pg_catalog, pg_temp',
  ])
  await assertSignatures(client, 'MIGRATION_017_ROLE_REFUSED', `
    SELECT rolname || ':' || rolcanlogin || ':' || rolinherit || ':' || rolsuper || ':' || rolbypassrls AS signature
    FROM pg_roles WHERE rolname = 'hub_r2_key_conformance_subject'
  `, ['hub_r2_key_conformance_subject:true:false:false:false'])
  await assertSignatures(client, 'MIGRATION_017_EXECUTE_PRIVILEGE_REFUSED', `
    WITH roles(role_name) AS (VALUES
      ('hub_r2_key_conformance_subject'), ('hub_r2_project_binding'),
      ('hub_r2_connections'), ('hub_r2_brain_attester'), ('public'))
    SELECT role_name || ':' || n.nspname || '.' || p.proname AS signature
    FROM roles CROSS JOIN pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('con', 'resolve_key_conformance_subject'),
      ('project', 'resolve_key_conformance_subject'))
      AND has_function_privilege(role_name, p.oid, 'EXECUTE')
    ORDER BY role_name, n.nspname, p.proname
  `, ['hub_r2_key_conformance_subject:project.resolve_key_conformance_subject'])
  await assertSignatures(client, 'MIGRATION_017_TABLE_PRIVILEGE_REFUSED', `
    SELECT table_schema || '.' || table_name || ':' || privilege_type AS signature
    FROM information_schema.table_privileges
    WHERE grantee = 'hub_r2_key_conformance_subject'
      AND table_schema IN ('iam','workspace','project','reg','brn','con')
    ORDER BY table_schema, table_name, privilege_type
  `, [])
  const sourceScopeAdmission = (await client.query(`
    SELECT p.prosrc AS definition
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'brn' AND p.proname = 'admit_binding_candidate'
  `)).rows[0]?.definition ?? ''
  if (!sourceScopeAdmission.includes("subject->>'sourceScopeId' !~ '^[0-9a-f]{64}$'")
    || sourceScopeAdmission.includes("(subject->>'sourceScopeId')::uuid IS NULL")) {
    fail('MIGRATION_017_SOURCE_SCOPE_ADMISSION_REFUSED')
  }
}

const assert018Catalog = async (client, migration018) => {
  const expectedFunctionBodies = expected018FunctionBodies(migration018)
  const functionBodies = (await client.query(`
    SELECT n.nspname || '.' || p.proname AS name, p.prosrc AS definition
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname || '.' || p.proname = ANY($1::text[])
    ORDER BY name
  `, [expectedFunctionBodies.map(({ name }) => name)])).rows
  if (JSON.stringify(functionBodies) !== JSON.stringify(expectedFunctionBodies)) {
    fail('MIGRATION_018_FUNCTION_SOURCE_REFUSED')
  }
  await assertSignatures(client, 'MIGRATION_018_FUNCTION_SECURITY_REFUSED', `
    SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || '):' ||
      pg_get_userbyid(p.proowner) || ':' || p.prosecdef || ':' || p.provolatile::text || ':' ||
      coalesce(array_to_string(p.proconfig, ','), '') AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'iam' AND p.proname = 'admit_brain_revision_selection'
  `, [
    'iam.admit_brain_revision_selection(uuid, uuid, uuid):iam_owner:true:s:search_path=pg_catalog, pg_temp',
  ])
  await assertSignatures(client, 'MIGRATION_018_EXECUTE_PRIVILEGE_REFUSED', `
    WITH roles(role_name) AS (VALUES
      ('hub_r2_brain_read'), ('hub_r2_project_binding'), ('hub_r2_connections'),
      ('hub_s3_read'), ('public'))
    SELECT role_name AS signature
    FROM roles
    WHERE has_function_privilege(
      role_name, 'iam.admit_brain_revision_selection(uuid, uuid, uuid)', 'EXECUTE'
    )
    ORDER BY role_name
  `, ['hub_r2_brain_read'])
  await assertSignatures(client, 'MIGRATION_018_TABLE_PRIVILEGE_REFUSED', `
    SELECT table_schema || '.' || table_name || ':' || privilege_type AS signature
    FROM information_schema.table_privileges
    WHERE grantee = 'hub_r2_brain_read'
      AND table_schema IN ('iam','workspace','project','reg','brn','con')
    ORDER BY table_schema, table_name, privilege_type
  `, [])
}

const assert019Catalog = async (client) => {
  await assertSignatures(client, 'MIGRATION_019_SCHEMA_OWNER_REFUSED', `
    SELECT nspname || ':' || pg_get_userbyid(nspowner) AS signature
    FROM pg_namespace WHERE nspname = 'builder'
  `, ['builder:builder_owner'])
  await assertSignatures(client, 'MIGRATION_019_TABLE_OWNER_REFUSED', `
    SELECT relname || ':' || pg_get_userbyid(relowner) AS signature
    FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'builder' AND c.relkind = 'r' ORDER BY relname
  `, [
    'actor_run:builder_owner', 'change:builder_owner', 'coding_session:builder_owner',
    'operation_receipt:builder_owner', 'plan:builder_owner', 'work_unit:builder_owner',
  ])
  await assertSignatures(client, 'MIGRATION_019_IAM_GRANT_OWNER_REFUSED', `
    SELECT pg_get_userbyid(c.relowner) AS signature
    FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'iam' AND c.relname = 'project_builder_grant' AND c.relkind = 'r'
  `, ['iam_owner'])
  await assertSignatures(client, 'MIGRATION_019_FUNCTION_SECURITY_REFUSED', `
    SELECT p.proname || ':' || pg_get_userbyid(p.proowner) || ':' || p.prosecdef || ':' ||
      coalesce(array_to_string(p.proconfig, ','), '') AS signature
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname = 'builder') OR (n.nspname = 'iam' AND p.proname IN ('admit_project_build','admit_project_source_read','ensure_project_builder_grant'))
    ORDER BY n.nspname, p.proname
  `, [
    'bind_sandbox:builder_owner:true:search_path=pg_catalog, pg_temp',
    'change_json:builder_owner:false:search_path=pg_catalog, pg_temp',
    'claim_change:builder_owner:true:search_path=pg_catalog, pg_temp',
    'create_change:builder_owner:true:search_path=pg_catalog, pg_temp',
    'fail_run:builder_owner:true:search_path=pg_catalog, pg_temp',
    'list_changes:builder_owner:true:search_path=pg_catalog, pg_temp',
    'read_snapshot:builder_owner:true:search_path=pg_catalog, pg_temp',
    'recover_and_list_queued:builder_owner:true:search_path=pg_catalog, pg_temp',
    'settle_result:builder_owner:true:search_path=pg_catalog, pg_temp',
    'admit_project_build:iam_owner:true:search_path=pg_catalog, pg_temp',
    'admit_project_source_read:iam_owner:true:search_path=pg_catalog, pg_temp',
    'ensure_project_builder_grant:iam_owner:true:search_path=pg_catalog, pg_temp',
  ])
  await assertSignatures(client, 'MIGRATION_019_TABLE_PRIVILEGE_REFUSED', `
    SELECT grantee || ':' || table_name || ':' || privilege_type AS signature
    FROM information_schema.table_privileges
    WHERE table_schema = 'builder' AND grantee IN ('hub_rb_ingress','hub_rb_executor','public')
    ORDER BY grantee, table_name, privilege_type
  `, [])
  await assertSignatures(client, 'MIGRATION_019_WRITER_INDEX_REFUSED', `
    SELECT indexname AS signature FROM pg_indexes
    WHERE schemaname = 'builder' AND indexname = 'one_active_writer_per_change'
      AND indexdef LIKE '%WHERE (state = ANY (%ADMITTED%RUNNING%'
  `, ['one_active_writer_per_change'])
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
  if (applied.has('019')) {
    await assert015Catalog(
      client, files.get('003'), files.get('005'), files.get('006'), files.get('011'),
      files.get('012'), files.get('013'), files.get('014'), files.get('015'),
      { after016: true, after017: true, after018: true, after019: true },
    )
    await assert016Catalog(client, files.get('016'))
    await assert017Catalog(client, files.get('017'))
    await assert018Catalog(client, files.get('018'))
    await assert019Catalog(client)
  } else if (applied.has('018')) {
    await assert015Catalog(
      client, files.get('003'), files.get('005'), files.get('006'), files.get('011'),
      files.get('012'), files.get('013'), files.get('014'), files.get('015'),
      { after016: true, after017: true, after018: true },
    )
    await assert016Catalog(client, files.get('016'))
    await assert017Catalog(client, files.get('017'))
    await assert018Catalog(client, files.get('018'))
  } else if (applied.has('017')) {
    await assert015Catalog(
      client, files.get('003'), files.get('005'), files.get('006'), files.get('011'),
      files.get('012'), files.get('013'), files.get('014'), files.get('015'),
      { after016: true, after017: true },
    )
    await assert016Catalog(client, files.get('016'))
    await assert017Catalog(client, files.get('017'))
  } else if (applied.has('016')) {
    await assert015Catalog(
      client, files.get('003'), files.get('005'), files.get('006'), files.get('011'),
      files.get('012'), files.get('013'), files.get('014'), files.get('015'), { after016: true },
    )
    await assert016Catalog(client, files.get('016'))
  } else if (applied.has('015')) await assert015Catalog(
    client, files.get('003'), files.get('005'), files.get('006'), files.get('011'),
    files.get('012'), files.get('013'), files.get('014'), files.get('015'),
  )
  else if (applied.has('014')) await assert014Catalog(
    client, files.get('003'), files.get('005'), files.get('006'), files.get('011'),
    files.get('012'), files.get('013'), files.get('014'),
  )
  else if (applied.has('013')) await assert013Catalog(
    client,
    files.get('003'),
    files.get('005'),
    files.get('006'),
    files.get('011'),
    files.get('012'),
    files.get('013'),
  )
  else if (applied.has('012')) await assert012Catalog(client, files.get('003'), files.get('005'), files.get('006'), files.get('011'), files.get('012'))
  else if (applied.has('011')) await assert011Catalog(client, files.get('003'), files.get('005'), files.get('006'), files.get('011'))
  else if (applied.has('010')) await assert010Catalog(client, files.get('003'), files.get('005'), files.get('006'))
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

const runMigrations = async ({ connectionString, migrations, recognizedMigrations = migrations }) => {
  const client = new pg.Client({ connectionString })
  await client.connect()
  const appliedNow = []
  try {
    for (const migration of migrations) {
      await client.query('BEGIN')
      try {
        await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLock.toString()])
        const ledger = await verifyLedger(client, recognizedMigrations)
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
      const ledger = await verifyLedger(client, recognizedMigrations)
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

export const runHubMigrations = ({ connectionString, migrationsRoot = defaultMigrationsRoot }) =>
  runMigrations({
    connectionString,
    migrations: loadMigrationFiles(migrationsRoot),
    recognizedMigrations: loadR2MigrationFiles(migrationsRoot),
  })

export const runR2HubMigrations = ({ connectionString, migrationsRoot = defaultMigrationsRoot }) =>
  runMigrations({ connectionString, migrations: loadR2MigrationFiles(migrationsRoot) })

export const runCurrentHubMigrations = ({ connectionString, migrationsRoot = defaultMigrationsRoot }) =>
  runMigrations({ connectionString, migrations: loadCurrentHubMigrationFiles(migrationsRoot) })

const readConnectionString = (path) => {
  if (!path || !existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) fail('MIGRATION_DATABASE_URL_FILE_REFUSED')
  const value = readFileSync(path, 'utf8').trim()
  if (!value) fail('MIGRATION_DATABASE_URL_EMPTY')
  return value
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const connectionString = readConnectionString(process.env.CONEXUS_MIGRATION_DATABASE_URL_FILE)
  process.stdout.write(`${JSON.stringify(await runCurrentHubMigrations({ connectionString }))}\n`)
}
