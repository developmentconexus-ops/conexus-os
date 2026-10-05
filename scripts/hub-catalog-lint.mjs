const RUNTIME_ROLE = 'hub_runtime'
const PRIVILEGE_OF = { r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE' }
const POLICY_HELPER = /^iam\.acting_/

const columnAcls = (catalog) => {
  const byTable = new Map()
  for (const line of catalog.column) {
    const found = /^column (\w+\.\w+)\.\w+ .* acl=(\S*)$/.exec(line)
    if (found?.[2]) byTable.set(found[1], [...(byTable.get(found[1]) ?? []), ...found[2].split(',')])
  }
  return byTable
}

const relations = (catalog) => {
  const columns = columnAcls(catalog)
  return catalog.relation.flatMap((line) => {
    const found = /^relation (\S+) kind=([rp]) owner=(\S+) rls=(\w+) forcerls=(\w+) .*acl=(\S*)$/.exec(line)
    return found ? [{ table: found[1], owner: found[3], rls: found[4] === 'true', force: found[5] === 'true', acl: [...found[6].split(','), ...(columns.get(found[1]) ?? [])] }] : []
  })
}

const policies = (catalog) => catalog.policy.flatMap((line) => {
  const found = /^policy (\S+)\.(\S+) cmd=(\S) permissive=\w+ roles=(\S*) using=/.exec(line)
  return found ? [{ table: found[1], name: found[2], command: found[3], roles: found[4].split(',') }] : []
})

const covers = (policy, command) => policy.command === '*' || policy.command === command

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// functions: [{ name: 'schema.name', owner, body }], read from pg_proc after the migrations replay.
export const lintCatalog = ({ catalog, functions, census }) => {
  const problems = []
  const tables = relations(catalog)
  const known = new Set(tables.map((row) => row.table))
  const allPolicies = policies(catalog)
  const permanent = new Map(census.unscoped.permanent.map((entry) => [entry.table, entry.reason]))
  const pending = new Map(census.unscoped.pending.map((entry) => [entry.table, entry.part]))

  for (const table of [...permanent.keys(), ...pending.keys()]) if (!known.has(table)) problems.push(`UNSCOPED_TABLES names ${table}, which is not a table of the catalog`)
  for (const table of permanent.keys()) if (pending.has(table)) problems.push(`${table} is both permanent and pending`)

  for (const row of tables) {
    const own = allPolicies.filter((policy) => policy.table === row.table && policy.roles.includes(RUNTIME_ROLE))
    const granted = (command) => row.acl.includes(`${RUNTIME_ROLE}:${PRIVILEGE_OF[command]}:false`)
    const covered = row.rls && row.force && Object.keys(PRIVILEGE_OF).every((command) => !granted(command) || own.some((policy) => covers(policy, command)))
    if (permanent.has(row.table)) continue
    if (pending.has(row.table)) {
      if (covered) problems.push(`${row.table} is policed but still listed as pending`)
      continue
    }
    if (!covered) problems.push(`${row.table} has no FORCE row level security with ${RUNTIME_ROLE} policies for each command it grants ${RUNTIME_ROLE}, and is not in UNSCOPED_TABLES`)
  }

  for (const row of tables.filter((candidate) => candidate.rls)) {
    const reader = new RegExp(`(?<![\\w.])${escapeRegExp(row.table)}(?![\\w.])`, 'i')
    const bridged = allPolicies.filter((policy) => policy.table === row.table && !policy.roles.includes(RUNTIME_ROLE))
    for (const fn of functions) {
      if (!reader.test(fn.body)) continue
      const covered = bridged.some((policy) => policy.roles.includes(fn.owner) && covers(policy, 'r'))
      if (!covered) problems.push(`${fn.name} owned by ${fn.owner} reads ${row.table}, which has no bridge policy for ${fn.owner}`)
    }
  }

  const ruleFunctions = functions.filter((fn) => !POLICY_HELPER.test(fn.name)).length
  const legacyOwner = allPolicies.filter((policy) => policy.name === 'legacy_owner').length
  for (const [item, count] of [['ruleFunctions', ruleFunctions], ['legacyOwnerPolicies', legacyOwner]]) {
    const ceiling = census.ceilings[item]
    if (ceiling === undefined) problems.push(`${item} has no recorded ceiling`)
    else if (count > ceiling) problems.push(`${item} is ${count}, above its ceiling ${ceiling}`)
  }
  return { problems, counts: { ruleFunctions, legacyOwnerPolicies: legacyOwner } }
}
