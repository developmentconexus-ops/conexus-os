const RUNTIME_ROLE = 'hub_runtime'
const READER_ROLE = 'hub_reader'
const COMMAND_ROLE = 'hub_command'
const GRANTEES = [RUNTIME_ROLE, READER_ROLE, COMMAND_ROLE]
const HELPER_SCHEMA = 'rls'
const HELPER_OWNER = 'iam_rls'
const LOCK_FUNCTION = 'iam.lock_administrators'
// The tables an installation administrator reads across Workspaces (admission child, section 4.2, rule 4).
const ADMINISTRATOR_REACH = Object.freeze(['project.project_deletion', 'connector.connection', 'iam.installation_administrator', 'iam.account'])
// The one table whose unported TypeScript reader keeps a runtime bridge until part 6.
const RUNTIME_BRIDGE_TABLES = Object.freeze(['iam.account'])

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const grantsOf = (acl) => (acl ? acl.split(',').filter(Boolean).map((entry) => entry.split(':')) : [])

// Privileges a role holds on a table, as sorted register strings: a table level privilege by name,
// a column level one as UPDATE(column,column).
const privilegesOf = (catalog, table, role) => {
  const relation = catalog.relation.find((line) => line.startsWith(`relation ${table} `))
  const tableLevel = relation ? grantsOf(/ acl=(\S*)$/.exec(relation)?.[1]).filter(([grantee]) => grantee === role).map(([, privilege]) => privilege) : []
  const columns = new Map()
  for (const line of catalog.column) {
    const found = /^column (\S+)\.(\w+) .* acl=(\S*)$/.exec(line)
    if (!found || found[1] !== table) continue
    for (const [grantee, privilege] of grantsOf(found[3])) if (grantee === role) columns.set(privilege, [...(columns.get(privilege) ?? []), found[2]])
  }
  const columnLevel = [...columns].filter(([privilege]) => !tableLevel.includes(privilege)).map(([privilege, names]) => `${privilege}(${names.sort().join(',')})`)
  return [...tableLevel, ...columnLevel].sort()
}

const relations = (catalog) => catalog.relation.flatMap((line) => {
  const found = /^relation (\S+) kind=([rp]) owner=(\S+) rls=(\w+) forcerls=(\w+) /.exec(line)
  return found ? [{ table: found[1], rls: found[4] === 'true', force: found[5] === 'true' }] : []
})

const policies = (catalog) => catalog.policy.flatMap((line) => {
  const found = /^policy (\S+)\.(\S+) cmd=(\S) permissive=\w+ roles=(\S*) using=(.*) check=(.*)$/s.exec(line)
  return found ? [{ table: found[1], name: found[2], command: found[3], roles: found[4].split(','), using: found[5], check: found[6] }] : []
})

const executors = (acl) => grantsOf(acl).filter(([, privilege]) => privilege === 'EXECUTE').map(([grantee]) => grantee)

const functionRows = (catalog) => catalog.function.flatMap((line) => {
  const found = /^function (\S+?)\((.*?)\) returns .* acl=(\S*) body=/.exec(line)
  return found ? [{ name: found[1], signature: `${found[1]}(${found[2]})`, executors: executors(found[3]) }] : []
})

const executeListOf = (catalog, role) => functionRows(catalog).filter((row) => row.executors.includes(role)).map((row) => row.signature)

const covers = (policy, command) => policy.command === '*' || policy.command === command
const sameList = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
const allowedFunction = (name) => name.startsWith(`${HELPER_SCHEMA}.`) || name === LOCK_FUNCTION
const show = (list) => (list.length > 0 ? list.join(', ') : 'nothing')

const lintSplitTable = ({ row, catalog, tablePolicies, problems, unported }) => {
  const table = row.table
  const relation = relations(catalog).find((candidate) => candidate.table === table)
  if (!relation?.rls || !relation.force) problems.push(`${table} is split but has no ENABLE and FORCE row level security`)
  const commandPolicies = tablePolicies.filter((policy) => policy.roles.includes(COMMAND_ROLE))
  const [command] = commandPolicies
  if (commandPolicies.length !== 1 || command.command !== '*' || command.using !== 'true' || command.check !== 'true' || command.roles.length !== 1) {
    problems.push(`${table} must have exactly one policy TO ${COMMAND_ROLE}, FOR ALL, USING (true) WITH CHECK (true)`)
  }
  const readerHeld = privilegesOf(catalog, table, READER_ROLE)
  const readerPolicies = tablePolicies.filter((policy) => policy.roles.includes(READER_ROLE))
  const named = (name) => readerPolicies.filter((policy) => policy.name === name && policy.command === 'r' && policy.roles.length === 1)
  if (readerHeld.length > 0 && !sameList(readerHeld, ['SELECT'])) problems.push(`${table} gives ${READER_ROLE} ${readerHeld.join(', ')}, and the reader may only SELECT`)
  if ((readerHeld.length > 0) !== (named('reader').length === 1)) problems.push(`${table} must have a reader policy named reader if and only if ${READER_ROLE} holds SELECT`)
  if (row.readerAdmin && !ADMINISTRATOR_REACH.includes(table)) problems.push(`${table} has reader_admin but is not on the administrator reach list`)
  if (Boolean(row.readerAdmin) !== (named('reader_admin').length === 1)) problems.push(`${table} must have a reader_admin policy if and only if its register row says readerAdmin`)
  for (const policy of readerPolicies) if (policy.name !== 'reader' && policy.name !== 'reader_admin') problems.push(`${table} has a reader policy named ${policy.name}, which is neither reader nor reader_admin`)
  if (Boolean(row.reader) !== (readerHeld.length > 0)) problems.push(`${table} register row says reader=${Boolean(row.reader)} but ${READER_ROLE} holds ${show(readerHeld)}`)
  for (const policy of tablePolicies.filter((candidate) => candidate.roles.includes(RUNTIME_ROLE))) {
    if (policy.name !== 'legacy_runtime' || !RUNTIME_BRIDGE_TABLES.includes(table)) problems.push(`${table} has a policy ${policy.name} TO ${RUNTIME_ROLE}; only legacy_runtime on ${RUNTIME_BRIDGE_TABLES.join(', ')} is allowed`)
    else if (!unported.get(table)?.length) problems.push(`${table} has a legacy_runtime bridge but no unported TypeScript reads it`)
  }
  if (RUNTIME_BRIDGE_TABLES.includes(table) && unported.get(table)?.length && !tablePolicies.some((policy) => policy.name === 'legacy_runtime')) {
    problems.push(`${table} is read by unported TypeScript and has no legacy_runtime bridge`)
  }
  const held = privilegesOf(catalog, table, COMMAND_ROLE)
  if (!sameList(held, row.command)) problems.push(`${table} gives ${COMMAND_ROLE} ${show(held)}, and its register row says ${show(row.command)}`)
  const runtime = privilegesOf(catalog, table, RUNTIME_ROLE)
  if (!sameList(runtime, row.runtime ?? [])) problems.push(`${table} gives ${RUNTIME_ROLE} ${show(runtime)}, and its register row says ${show(row.runtime ?? [])}`)
  for (const key of row.compositeKeys ?? []) if (!catalog.constraint.some((line) => line.startsWith(`constraint ${table}.${key} `))) problems.push(`${table} register names composite key ${key}, which does not exist`)
}

const lintPendingTable = ({ entry, catalog, tablePolicies, problems }) => {
  const table = entry.table
  if (tablePolicies.some((policy) => policy.roles.some((role) => GRANTEES.includes(role)))) problems.push(`${table} is policed but still listed as pending`)
  for (const role of GRANTEES) {
    const held = privilegesOf(catalog, table, role)
    const named = entry.privileges?.[role] ?? []
    if (!sameList(held, named)) problems.push(`${table} gives ${role} ${show(held)}, and its register row says ${show(named)}`)
  }
}

const lintBridges = ({ tables, allPolicies, functions, problems }) => {
  for (const row of tables.filter((candidate) => candidate.rls)) {
    const reader = new RegExp(`(?<![\\w.])${escapeRegExp(row.table)}(?![\\w.])`, 'i')
    const bridged = allPolicies.filter((policy) => policy.table === row.table && !policy.roles.some((role) => GRANTEES.includes(role)))
    for (const fn of functions) {
      if (!reader.test(fn.body)) continue
      if (!bridged.some((policy) => policy.roles.includes(fn.owner) && covers(policy, 'r'))) problems.push(`${fn.name} owned by ${fn.owner} reads ${row.table}, which has no bridge policy for ${fn.owner}`)
    }
    const readerOwners = new Set(functions.filter((fn) => reader.test(fn.body)).map((fn) => fn.owner))
    for (const owner of new Set(bridged.flatMap((policy) => policy.roles))) {
      if (!readerOwners.has(owner)) problems.push(`${row.table} has a bridge policy for ${owner}, which owns no function that reads it`)
    }
  }
}

const lintFunctions = ({ catalog, functions, census, problems }) => {
  for (const role of [READER_ROLE, COMMAND_ROLE]) {
    const held = executeListOf(catalog, role)
    const named = census.register.functions[role] ?? []
    if (!sameList(held, named)) problems.push(`${role} may EXECUTE ${show(held.sort())}, and the register says ${show(named)}`)
  }
  for (const fn of functions) {
    if (fn.owner === HELPER_OWNER && !fn.name.startsWith(`${HELPER_SCHEMA}.`)) problems.push(`${fn.name} is owned by ${HELPER_OWNER}; a helper lives in schema ${HELPER_SCHEMA}`)
    if (fn.name.startsWith(`${HELPER_SCHEMA}.`) && fn.owner !== HELPER_OWNER) problems.push(`${fn.name} must be owned by ${HELPER_OWNER}, not ${fn.owner}`)
  }
  for (const row of functionRows(catalog)) {
    if (row.name.startsWith(`${HELPER_SCHEMA}.`) && row.executors.some((grantee) => grantee !== HELPER_OWNER && grantee !== READER_ROLE)) problems.push(`${row.signature} is executable by ${row.executors.join(', ')}; only ${READER_ROLE} may`)
    if (row.name === LOCK_FUNCTION && row.executors.some((grantee) => grantee !== 'iam_owner' && grantee !== COMMAND_ROLE)) problems.push(`${row.signature} is executable by ${row.executors.join(', ')}; only ${COMMAND_ROLE} may`)
  }
}

// functions: [{ name: 'schema.name', owner, body }], read from pg_proc after the migrations replay.
// unported: Map of table to the TypeScript files outside the data module's path that name it.
export const lintCatalog = ({ catalog, functions, census, unported = new Map() }) => {
  const problems = []
  const tables = relations(catalog)
  const known = new Set(tables.map((row) => row.table))
  const allPolicies = policies(catalog)
  const permanent = new Map(census.unscoped.permanent.map((entry) => [entry.table, entry.reason]))
  const pending = new Map(census.unscoped.pending.map((entry) => [entry.table, entry]))
  const split = new Map(census.register.split.map((entry) => [entry.table, entry]))

  for (const table of [...permanent.keys(), ...pending.keys(), ...split.keys()]) if (!known.has(table)) problems.push(`the register names ${table}, which is not a table of the catalog`)
  for (const table of split.keys()) if (permanent.has(table) || pending.has(table)) problems.push(`${table} is split and also listed as permanent or pending`)
  for (const table of permanent.keys()) if (pending.has(table)) problems.push(`${table} is both permanent and pending`)

  for (const row of tables) {
    const tablePolicies = allPolicies.filter((policy) => policy.table === row.table)
    if (split.has(row.table)) lintSplitTable({ row: split.get(row.table), catalog, tablePolicies, problems, unported })
    else if (pending.has(row.table)) lintPendingTable({ entry: pending.get(row.table), catalog, tablePolicies, problems })
    else if (!permanent.has(row.table)) problems.push(`${row.table} is in no list of the register: it is not split, pending or permanent`)
  }

  lintBridges({ tables, allPolicies, functions, problems })
  lintFunctions({ catalog, functions, census, problems })

  const ruleFunctions = functions.filter((fn) => !allowedFunction(fn.name)).length
  const legacyOwner = allPolicies.filter((policy) => policy.name === 'legacy_owner').length
  const runtimePrivileges = tables.reduce((sum, row) => sum + privilegesOf(catalog, row.table, RUNTIME_ROLE).length, 0) + executeListOf(catalog, RUNTIME_ROLE).length
  for (const [item, count] of [['ruleFunctions', ruleFunctions], ['legacyOwnerPolicies', legacyOwner], ['runtimePrivileges', runtimePrivileges]]) {
    const ceiling = census.ceilings[item]
    if (ceiling === undefined) problems.push(`${item} has no recorded ceiling`)
    else if (count > ceiling) problems.push(`${item} is ${count}, above its ceiling ${ceiling}`)
  }
  return { problems, counts: { ruleFunctions, legacyOwnerPolicies: legacyOwner, runtimePrivileges } }
}
