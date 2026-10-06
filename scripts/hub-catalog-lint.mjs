const RUNTIME_ROLE = 'hub_runtime'
const READER_ROLE = 'hub_reader'
const COMMAND_ROLE = 'hub_command'
const GRANTEES = [RUNTIME_ROLE, READER_ROLE, COMMAND_ROLE]
const HELPER_SCHEMA = 'rls'
const HELPER_OWNER = 'iam_rls'
const LOCK_FUNCTION = 'iam.lock_administrators'
const LOCK_FUNCTION_OWNER = 'conexus_owner'
// The tables an installation administrator reads across Workspaces (admission child, section 4.2, rule 4).
const ADMINISTRATOR_REACH = Object.freeze(['project.project_deletion', 'connector.connection', 'iam.installation_administrator', 'iam.account'])
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

const sameList = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
const allowedFunction = (name) => name.startsWith(`${HELPER_SCHEMA}.`) || name === LOCK_FUNCTION
const show = (list) => (list.length > 0 ? list.join(', ') : 'nothing')

const lintSplitTable = ({ row, catalog, tablePolicies, problems }) => {
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
  const readerAllowed = row.readerColumns ? [`SELECT(${[...row.readerColumns].sort().join(',')})`] : ['SELECT']
  if (readerHeld.length > 0 && !sameList(readerHeld, readerAllowed)) problems.push(`${table} gives ${READER_ROLE} ${readerHeld.join(', ')}, and the reader may only ${readerAllowed[0]}`)
  if ((readerHeld.length > 0) !== (named('reader').length === 1)) problems.push(`${table} must have a reader policy named reader if and only if ${READER_ROLE} holds SELECT`)
  if (row.readerAdmin && !ADMINISTRATOR_REACH.includes(table)) problems.push(`${table} has reader_admin but is not on the administrator reach list`)
  if (Boolean(row.readerAdmin) !== (named('reader_admin').length === 1)) problems.push(`${table} must have a reader_admin policy if and only if its register row says readerAdmin`)
  for (const policy of readerPolicies) if (policy.name !== 'reader' && policy.name !== 'reader_admin') problems.push(`${table} has a reader policy named ${policy.name}, which is neither reader nor reader_admin`)
  if (Boolean(row.reader) !== (readerHeld.length > 0)) problems.push(`${table} register row says reader=${Boolean(row.reader)} but ${READER_ROLE} holds ${show(readerHeld)}`)
  for (const policy of tablePolicies.filter((candidate) => candidate.roles.includes(RUNTIME_ROLE))) problems.push(`${table} has a policy ${policy.name} TO ${RUNTIME_ROLE}; no policy names it`)
  for (const policy of tablePolicies.filter((candidate) => candidate.name.startsWith('legacy_'))) problems.push(`${table} has a policy ${policy.name}; no legacy policy remains`)
  const held = privilegesOf(catalog, table, COMMAND_ROLE)
  if (!sameList(held, row.command)) problems.push(`${table} gives ${COMMAND_ROLE} ${show(held)}, and its register row says ${show(row.command)}`)
  const runtime = privilegesOf(catalog, table, RUNTIME_ROLE)
  if (!sameList(runtime, row.runtime ?? [])) problems.push(`${table} gives ${RUNTIME_ROLE} ${show(runtime)}, and its register row says ${show(row.runtime ?? [])}`)
  for (const column of row.keyColumns ?? []) if (!catalog.column.some((line) => line.startsWith(`column ${table}.${column} `))) problems.push(`${table} register names key column ${column}, which does not exist`)
  for (const policy of readerPolicies) if (!policy.using.includes('rls.acting_account()')) problems.push(`${table} reader policy ${policy.name} must call rls.acting_account()`)
  for (const key of row.compositeKeys ?? []) if (!catalog.constraint.some((line) => line.startsWith(`constraint ${table}.${key} `))) problems.push(`${table} register names composite key ${key}, which does not exist`)
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
    if (row.name === LOCK_FUNCTION && row.executors.some((grantee) => grantee !== LOCK_FUNCTION_OWNER && grantee !== COMMAND_ROLE)) problems.push(`${row.signature} is executable by ${row.executors.join(', ')}; only ${COMMAND_ROLE} may`)
  }
}

// functions: [{ name: 'schema.name', owner, body }], read from pg_proc after the migrations replay.
export const lintCatalog = ({ catalog, functions, census }) => {
  const problems = []
  const tables = relations(catalog)
  const known = new Set(tables.map((row) => row.table))
  const allPolicies = policies(catalog)
  const permanent = new Map(census.unscoped.permanent.map((entry) => [entry.table, entry.reason]))
  const split = new Map(census.register.split.map((entry) => [entry.table, entry]))

  for (const table of [...permanent.keys(), ...split.keys()]) if (!known.has(table)) problems.push(`the register names ${table}, which is not a table of the catalog`)
  for (const table of split.keys()) if (permanent.has(table)) problems.push(`${table} is split and also listed as permanent`)

  for (const row of tables) {
    const tablePolicies = allPolicies.filter((policy) => policy.table === row.table)
    if (split.has(row.table)) lintSplitTable({ row: split.get(row.table), catalog, tablePolicies, problems })
    else if (permanent.has(row.table)) {
      const named = census.unscoped.permanent.find((entry) => entry.table === row.table)?.privileges ?? {}
      for (const role of GRANTEES) {
        const held = privilegesOf(catalog, row.table, role)
        if (!sameList(held, named[role] ?? [])) problems.push(`${row.table} is permanent but gives ${role} ${show(held)}, and its register row says ${show(named[role] ?? [])}`)
      }
    } else problems.push(`${row.table} is in no list of the register: it is not split or permanent`)
  }

  lintFunctions({ catalog, functions, census, problems })

  const ruleFunctions = functions.filter((fn) => !allowedFunction(fn.name)).length
  const runtimePrivileges = tables.reduce((sum, row) => sum + privilegesOf(catalog, row.table, RUNTIME_ROLE).length, 0) + executeListOf(catalog, RUNTIME_ROLE).length
  for (const [item, count] of [['ruleFunctions', ruleFunctions], ['runtimePrivileges', runtimePrivileges]]) {
    const ceiling = census.ceilings[item]
    if (ceiling === undefined) problems.push(`${item} has no recorded ceiling`)
    else if (count > ceiling) problems.push(`${item} is ${count}, above its ceiling ${ceiling}`)
  }
  return { problems, counts: { ruleFunctions, runtimePrivileges } }
}
