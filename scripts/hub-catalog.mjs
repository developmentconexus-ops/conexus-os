import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
export const catalogSnapshotPath = 'contracts/technical/hub-catalog-snapshot.json'

// Same shape as scripts/run-hub-migrations.mjs, whose callers match on the code prefix.
const fail = (code, detail = '') => {
  throw new Error(`${code}${detail ? `:${detail}` : ''}`)
}

// A GRANT followed by the matching REVOKE leaves an object's ACL as an explicit array where it was
// NULL before, with exactly the same privileges. Comparing the raw array would refuse a database
// whose permissions never changed, so ACLs compare as effective privileges. Grantor is omitted,
// because who granted a privilege does not change who holds it.
const effective = (acl) => `(SELECT coalesce(string_agg(entry, ',' ORDER BY entry), '') FROM (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ':' || a.privilege_type || ':' || a.is_grantable AS entry FROM aclexplode(CASE WHEN cardinality(${acl}) > 0 THEN ${acl} END) AS a) AS e)`

const userSchemas = `n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg\\_temp%' AND n.nspname NOT LIKE 'pg\\_toast\\_temp%'`

// Everything here is scoped to one database. Roles are cluster-global, so a shared cluster that
// holds several installs would show another database's roles at version 001 and no per-version
// digest could be stable. Roles are held to an invariant by assertRoleInvariants instead.
// Every line is OID-free, so two clusters compare equal when their schemas do.
const SECTIONS = Object.freeze({
  schema: `SELECT 'schema ' || n.nspname || ' owner=' || pg_get_userbyid(n.nspowner) || ' acl=' || ${effective("coalesce(n.nspacl, acldefault('n', n.nspowner))")} FROM pg_namespace n WHERE ${userSchemas}`,
  relation: `SELECT 'relation ' || n.nspname || '.' || c.relname || ' kind=' || c.relkind::text || ' owner=' || pg_get_userbyid(c.relowner) || ' rls=' || c.relrowsecurity || ' forcerls=' || c.relforcerowsecurity || ' disabled_triggers=' || (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgenabled = 'D') || ' acl=' || ${effective("coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END::\"char\", c.relowner))")} FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE ${userSchemas} AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')`,
  column: `SELECT 'column ' || n.nspname || '.' || c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || ' notnull=' || a.attnotnull || ' default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ' acl=' || ${effective('a.attacl')} FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE ${userSchemas} AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND a.attnum > 0 AND NOT a.attisdropped`,
  constraint: `SELECT 'constraint ' || n.nspname || '.' || c.relname || '.' || k.conname || ' ' || pg_get_constraintdef(k.oid) FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE ${userSchemas}`,
  index: `SELECT 'index ' || n.nspname || '.' || i.relname || ' ' || pg_get_indexdef(i.oid) FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_namespace n ON n.oid = i.relnamespace WHERE ${userSchemas}`,
  function: `SELECT 'function ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') returns ' || pg_get_function_result(p.oid) || ' kind=' || p.prokind::text || ' owner=' || pg_get_userbyid(p.proowner) || ' secdef=' || p.prosecdef || ' volatility=' || p.provolatile::text || ' config=' || coalesce(array_to_string(p.proconfig, ','), '') || ' acl=' || ${effective("coalesce(p.proacl, acldefault('f', p.proowner))")} || ' body=' || md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE ${userSchemas}`,
  trigger: `SELECT 'trigger ' || n.nspname || '.' || c.relname || '.' || t.tgname || ' enabled=' || t.tgenabled::text || ' ' || pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE ${userSchemas} AND NOT t.tgisinternal`,
  rule: `SELECT 'rule ' || n.nspname || '.' || c.relname || '.' || r.rulename || ' ' || pg_get_ruledef(r.oid) FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class JOIN pg_namespace n ON n.oid = c.relnamespace WHERE ${userSchemas} AND r.rulename <> '_RETURN'`,
  policy: `SELECT 'policy ' || n.nspname || '.' || c.relname || '.' || pol.polname || ' cmd=' || pol.polcmd::text || ' permissive=' || pol.polpermissive || ' roles=' || array_to_string(ARRAY(SELECT CASE WHEN r = 0 THEN 'public' ELSE pg_get_userbyid(r) END FROM unnest(pol.polroles) AS r ORDER BY 1), ',') || ' using=' || coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' check=' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE ${userSchemas}`,
  type: `SELECT 'type ' || n.nspname || '.' || t.typname || ' kind=' || t.typtype::text || ' owner=' || pg_get_userbyid(t.typowner) || ' labels=' || coalesce((SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid), '') FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE ${userSchemas} AND t.typtype IN ('e', 'd', 'c') AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid AND c.relkind <> 'c')`,
  default_acl: `SELECT 'default_acl ' || pg_get_userbyid(d.defaclrole) || ' schema=' || coalesce(n.nspname, '') || ' objtype=' || d.defaclobjtype::text || ' acl=' || ${effective("d.defaclacl")} FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace`,
  extension: `SELECT 'extension ' || extname || ' ' || extversion FROM pg_extension`,
})

export const CATALOG_SECTIONS = Object.freeze(Object.keys(SECTIONS))

export const readCatalog = async (client) => {
  const catalog = {}
  for (const [name, sql] of Object.entries(SECTIONS)) {
    catalog[name] = (await client.query(sql)).rows.map(row => Object.values(row)[0]).sort()
  }
  return catalog
}

export const catalogDigest = (catalog) =>
  createHash('sha256').update(JSON.stringify(CATALOG_SECTIONS.map(section => [section, catalog[section] ?? []]))).digest('hex')

// Names the first differing lines, so a refusal says which object moved rather than which
// numbered assertion tripped.
export const describeCatalogDrift = (actual, expected, limit = 6) => {
  const lines = []
  for (const section of CATALOG_SECTIONS) {
    const have = new Set(actual[section] ?? [])
    const want = new Set(expected[section] ?? [])
    for (const line of want) if (!have.has(line)) lines.push(`missing ${line}`)
    for (const line of have) if (!want.has(line)) lines.push(`unexpected ${line}`)
  }
  return lines.length === 0 ? null : `${lines.length} differing lines; ${lines.slice(0, limit).join(' | ')}`
}

export const readCommittedSnapshot = (root = repositoryRoot) =>
  JSON.parse(readFileSync(resolve(root, catalogSnapshotPath), 'utf8'))

// Refuses the catalog when it is not the one a clean replay of the ledger's versions produces.
// Only the head version carries a full catalog, so earlier versions report by digest alone.
export const assertCatalogAt = async (client, snapshot, version) => {
  const expected = snapshot.digests[version]
  if (!expected) fail('MIGRATION_CATALOG_VERSION_UNKNOWN', version)
  const actual = await readCatalog(client)
  if (catalogDigest(actual) === expected) return
  const detail = version === snapshot.head ? describeCatalogDrift(actual, snapshot.catalog) : `version ${version} digest ${catalogDigest(actual)} expected ${expected}`
  fail('MIGRATION_CATALOG_DRIFT', detail)
}

// These are the properties a regenerated snapshot must never be able to bless, so they are
// asserted directly rather than compared. No Hub role may hold an attribute that bypasses the
// owner boundary, and no Hub or owner role may be a member of another, which is the SET ROLE path
// docs/reference/data-and-persistence.md section 6.2 forbids.
export const assertRoleInvariants = async (client) => {
  const elevated = (await client.query(`
    SELECT rolname FROM pg_roles
    WHERE (rolname LIKE 'hub\\_%' OR rolname LIKE '%\\_owner')
      AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
    ORDER BY rolname
  `)).rows.map(row => row.rolname)
  if (elevated.length > 0) fail('MIGRATION_ROLE_ATTRIBUTE_REFUSED', elevated.join(','))

  const memberships = (await client.query(`
    SELECT pg_get_userbyid(m.member) || ' in ' || pg_get_userbyid(m.roleid) AS membership
    FROM pg_auth_members m
    WHERE pg_get_userbyid(m.member) LIKE 'hub\\_%' OR pg_get_userbyid(m.member) LIKE '%\\_owner'
      OR pg_get_userbyid(m.roleid) LIKE 'hub\\_%' OR pg_get_userbyid(m.roleid) LIKE '%\\_owner'
    ORDER BY 1
  `)).rows.map(row => row.membership)
  if (memberships.length > 0) fail('MIGRATION_ROLE_MEMBERSHIP_REFUSED', memberships.join(','))
}
