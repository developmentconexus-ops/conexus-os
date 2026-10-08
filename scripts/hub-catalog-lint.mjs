const RUNTIME_ROLE = 'hub_runtime'
const RETIRED_ROLES = ['hub_reader', 'hub_command', 'iam_rls', 'hub_builder_ingress']
const LOCK_FUNCTION = 'iam.lock_administrators'
const LOCK_FUNCTION_OWNER = 'conexus_owner'
const grantsOf = (acl) => (acl ? acl.split(',').filter(Boolean).map((entry) => entry.split(':')) : [])

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

const functionRows = (catalog) => catalog.function.flatMap((line) => {
  const found = /^function (\S+?)\((.*?)\) returns .* owner=(\S+) .* acl=(\S*) body=/.exec(line)
  return found ? [{ name: found[1], signature: `${found[1]}(${found[2]})`, owner: found[3], executors: grantsOf(found[4]).filter(([, privilege]) => privilege === 'EXECUTE').map(([grantee]) => grantee) }] : []
})
const sameList = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
const show = (list) => list.length > 0 ? list.join(', ') : 'nothing'

export const lintCatalog = ({ catalog, functions, census }) => {
  const problems = []
  const relations = catalog.relation.flatMap((line) => {
    const found = /^relation (\S+) kind=([rp]) owner=(\S+) rls=(\w+) forcerls=(\w+) /.exec(line)
    return found ? [{ table: found[1], rls: found[4] === 'true', force: found[5] === 'true' }] : []
  })
  const known = new Set(relations.map(({ table }) => table))
  const permanent = new Map(census.unscoped.permanent.map((entry) => [entry.table, entry]))
  const registered = new Map(census.register.tables.map((entry) => [entry.table, entry]))
  const allRows = [...permanent.values(), ...registered.values()]

  for (const row of allRows) if (!known.has(row.table)) problems.push(`the register names ${row.table}, which is not a table of the catalog`)
  for (const row of relations) {
    if (row.rls || row.force) problems.push(`${row.table} must have row level security disabled`)
    if (!registered.has(row.table) && !permanent.has(row.table)) problems.push(`${row.table} is in no list of the register: it is not runtime or permanent`)
  }
  if (catalog.policy.length > 0) problems.push(`the catalog has ${catalog.policy.length} row security policies; none are registered`)

  for (const row of allRows) {
    const expected = row.privileges ?? []
    const held = privilegesOf(catalog, row.table, RUNTIME_ROLE)
    if (!sameList(held, expected)) problems.push(`${row.table} gives ${RUNTIME_ROLE} ${show(held)}, and its register row says ${show(expected)}`)
    for (const role of RETIRED_ROLES) {
      const retired = privilegesOf(catalog, row.table, role)
      if (retired.length > 0) problems.push(`${row.table} still grants ${role} ${show(retired)}`)
    }
    for (const column of row.keyColumns ?? []) if (!catalog.column.some((line) => line.startsWith(`column ${row.table}.${column} `))) problems.push(`${row.table} register names key column ${column}, which does not exist`)
    for (const key of row.compositeKeys ?? []) if (!catalog.constraint.some((line) => line.startsWith(`constraint ${row.table}.${key} `))) problems.push(`${row.table} register names composite key ${key}, which does not exist`)
  }

  const rows = functionRows(catalog)
  const expectedFunctions = census.register.functions?.[RUNTIME_ROLE] ?? []
  const actualFunctions = rows.filter((row) => row.executors.includes(RUNTIME_ROLE)).map((row) => row.signature)
  if (!sameList(actualFunctions, expectedFunctions)) problems.push(`${RUNTIME_ROLE} may EXECUTE ${show(actualFunctions)}, and the register says ${show(expectedFunctions)}`)
  for (const row of rows) {
    const expectedExecutors = row.name === LOCK_FUNCTION ? [LOCK_FUNCTION_OWNER, RUNTIME_ROLE] : [row.owner]
    if (!sameList(row.executors, expectedExecutors)) problems.push(`${row.signature} is executable by ${show(row.executors)}, and only ${show(expectedExecutors)} may`)
    if (row.name === LOCK_FUNCTION && row.owner !== LOCK_FUNCTION_OWNER) problems.push(`${LOCK_FUNCTION} must be owned by ${LOCK_FUNCTION_OWNER}, not ${row.owner}`)
    if (RETIRED_ROLES.some((role) => row.executors.includes(role))) problems.push(`${row.signature} is executable by a retired role`)
  }
  const runtimePrivileges = allRows.reduce((sum, row) => sum + privilegesOf(catalog, row.table, RUNTIME_ROLE).length, 0) + actualFunctions.length
  for (const [item, count] of [['ruleFunctions', functions.filter((fn) => fn.name !== LOCK_FUNCTION).length], ['runtimePrivileges', runtimePrivileges]]) {
    const ceiling = census.ceilings[item]
    if (ceiling === undefined) problems.push(`${item} has no recorded ceiling`)
    else if (count > ceiling) problems.push(`${item} is ${count}, above its ceiling ${ceiling}`)
  }
  return { problems, counts: { ruleFunctions: functions.filter((fn) => fn.name !== LOCK_FUNCTION).length, runtimePrivileges } }
}
