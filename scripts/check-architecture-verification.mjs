import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(new URL('../', import.meta.url).pathname)
const args = process.argv.slice(2)
const historical = args.includes('--historical')
const rootArgument = args.find(argument => argument !== '--historical')
const root = rootArgument ? resolve(rootArgument) : repositoryRoot
const errors = []

const read = path => {
  try {
    return readFileSync(resolve(root, path), 'utf8')
  } catch (error) {
    console.error(`unable to read verification file ${path} under ${root}: ${error.code ?? error.message}`)
    process.exit(1)
  }
}

const architecture = read('docs/architecture/index.md')
const data = read('docs/reference/data-and-persistence.md')
const gateway = read('docs/reference/integrations-and-gateway.md')

const normalize = value => value.trim().replace(/\s+/g, ' ')
const sameSet = (left, right) => {
  const a = [...new Set(left)].sort()
  const b = [...new Set(right)].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

const sectionBetween = (text, startMarker, endMarker, label) => {
  const start = text.indexOf(startMarker)
  const end = start < 0 ? -1 : text.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) {
    errors.push(`missing ${label} section boundary`)
    return ''
  }
  return text.slice(start + startMarker.length, end)
}

// Current architecture owner and dependency constraints.
const expectedOwners = [
  'Identity & Access',
  'Workspace',
  'Project',
  'Builder',
  'Artifact Registry',
  'Connections',
  'Capability Gateway',
  'Brain',
  'Production Agent Runtime (PAR)',
  'Release',
  'Observability & Audit',
  'Attachments & Blob',
  'Managed Application Runtime (MAR)'
]
const ownerSection = sectionBetween(
  architecture,
  '## 4. Semantic owner/module architecture',
  '## 4.1 Closed dependency architecture',
  'semantic owner'
)
const actualOwners = [...ownerSection.matchAll(/^\| \*\*(.+?)\*\* \|/gm)].map(([, owner]) => owner)
if (!sameSet(actualOwners, expectedOwners)) {
  errors.push(`semantic owner set changed: expected ${expectedOwners.join(', ')}; got ${actualOwners.join(', ') || 'none'}`)
}
if (!architecture.includes('recovery meaning remains owner-local; no generic Recovery owner/FSM exists')) {
  errors.push('owner-local recovery law is missing')
}

// 3N-S3 — closed dependency architecture.
const expectedL7 = [
  'CreateProject',
  'SetProjectBinding',
  'QualifyConnection',
  'InceptionInvestigation',
  'BrainHealthProbe',
  'ComposeRelease',
  'PromoteRelease'
]
const l7Match = architecture.match(/contains exactly seven flows:\s*```text\s*([\s\S]*?)```/)
const actualL7 = l7Match
  ? l7Match[1].split('\n').map(line => line.trim()).filter(Boolean)
  : []
if (!sameSet(actualL7, expectedL7)) {
  errors.push(`L7 orchestration set changed: expected ${expectedL7.join(', ')}; got ${actualL7.join(', ') || 'none'}`)
}

if (!architecture.includes('There is exactly one domain dependency inversion:')) {
  errors.push('single domain dependency inversion projection changed')
}

const expectedInfrastructureBoundaries = ['CodingRuntime', 'CredentialBackend', 'BlobStore/CAS', 'GitInfra']
const boundaryMatch = architecture.match(/3D infrastructure boundaries are exactly ([^.]+)\./)
const actualInfrastructureBoundaries = boundaryMatch
  ? [...boundaryMatch[1].matchAll(/`([^`]+)`/g)].map(([, name]) => name)
  : []
if (!sameSet(actualInfrastructureBoundaries, expectedInfrastructureBoundaries)) {
  errors.push(`infrastructure boundary set changed: expected ${expectedInfrastructureBoundaries.join(', ')}; got ${actualInfrastructureBoundaries.join(', ') || 'none'}`)
}

// Current data closure.
const schemaMatch = data.match(/`hub_control` has exactly (\d+) owner schemas:\s*```text\s*([\s\S]*?)```/)
const declaredSchemaCount = Number(schemaMatch?.[1] ?? NaN)
const declaredSchemas = schemaMatch
  ? schemaMatch[2].split(/\s+/).map(value => value.trim()).filter(Boolean)
  : []
if (!Number.isFinite(declaredSchemaCount) || declaredSchemas.length !== declaredSchemaCount || new Set(declaredSchemas).size !== declaredSchemas.length) {
  errors.push(`durable record schema closure changed: projected=${declaredSchemas.length}, declared=${declaredSchemaCount}`)
}

const recordSection = sectionBetween(
  data,
  '## 6.5.1 Current durable record inventory',
  '## 6.5.2 Current Tier-2 cross-module FK allowlist',
  'durable record inventory'
)
const declaredRecordCount = Number(recordSection.match(/TOTAL\s+(\d+)/)?.[1] ?? NaN)
const recordRows = [...recordSection.matchAll(/^([a-z]+): (.+)$/gm)]
  .map(([, schema, records]) => ({ schema, records: records.split(' / ').map(value => value.trim()).filter(Boolean) }))
const recordSchemas = recordRows.map(row => row.schema)
if (!sameSet(recordSchemas, declaredSchemas) || new Set(recordSchemas).size !== recordRows.length || recordRows.some(row => row.records.length === 0)) {
  errors.push(`durable record schema closure changed: declared=${declaredSchemas.join(',') || 'none'}; projected=${recordSchemas.join(',') || 'none'}`)
}
const actualRecordCount = recordRows.reduce((sum, row) => sum + row.records.length, 0)
const declaredArchitectureRecordCount = Number(data.match(/closed at (\d+) record classes/)?.[1] ?? NaN)
if (!Number.isFinite(declaredRecordCount) || actualRecordCount !== declaredRecordCount || declaredRecordCount !== declaredArchitectureRecordCount) {
  errors.push(`durable record inventory count changed: projected=${actualRecordCount}, declared=${declaredRecordCount}, architecture=${declaredArchitectureRecordCount}`)
}
const recordsBySchema = new Map(recordRows.map(row => [row.schema, new Set(row.records)]))

const fkHeadingMatch = data.match(/## 6\.5\.2 Current Tier-2 cross-module FK allowlist — (\d+)/)
const fkHeadingCount = Number(fkHeadingMatch?.[1] ?? NaN)
const fkSection = sectionBetween(
  data,
  '## 6.5.2 Current Tier-2 cross-module FK allowlist',
  'Tier-3 semantic references/digests',
  'Tier-2 FK allowlist'
)
const fkRows = [...fkSection.matchAll(/^\| (\d+) \| (.+?) \|$/gm)]
  .map(([, number, cell]) => ({ number: Number(number), cell, expression: cell.match(/`([^`]+)`/)?.[1] ?? '' }))
if (!Number.isFinite(fkHeadingCount) || fkRows.length !== fkHeadingCount) {
  errors.push(`Tier-2 FK allowlist count changed: projected=${fkRows.length}, declared=${fkHeadingCount}`)
}
if (fkRows.some((row, index) => row.number !== index + 1)) errors.push('Tier-2 FK allowlist numbering changed')
if (!data.includes('Tier-2 is admitted only when')) errors.push('Tier-2 FK admission rule is missing from current data authority')

for (const row of fkRows) {
  const match = row.expression.match(/^([a-z]+)\.([a-z_]+)\.[a-z_]+ → ([a-z]+)\.([a-z_]+)\(id\)$/)
  if (!match) {
    errors.push(`Tier-2 FK expression is not structurally parseable: ${row.expression || row.cell}`)
    continue
  }
  const [, sourceSchema, sourceRecord, targetSchema, targetRecord] = match
  const sourceExists = recordsBySchema.get(sourceSchema)?.has(sourceRecord)
  const targetExists = recordsBySchema.get(targetSchema)?.has(targetRecord)
  if (!sourceExists || !targetExists) {
    errors.push(`Tier-2 FK endpoint is outside current data closure: ${row.expression}`)
  }
}

if (recordsBySchema.get('gw')?.has('budget_counter')) {
  const budgetProjectionComplete =
    gateway.includes('`budget_counter`') &&
    gateway.includes('external-effect unit/budget authority') &&
    /Product Agent[\s\S]*budgets/.test(gateway) &&
    gateway.includes('not model-spend authority')
  if (!budgetProjectionComplete) errors.push('gw.budget_counter lacks current Gateway consumer/invariant projection')
}

if (historical) {
  const roadmap = read('docs/roadmap.md')
  const phase3M = read('docs/phases/3m-failure-recovery-architecture.md')
  const contract = read('docs/phases/3n-architecture-verification.md')
  const managedQualification = read('docs/reference/managed-execution-qualification.md')

  // Historical phase progression and closure routing audit.
  const roadmapRows = [...roadmap.matchAll(/^\| ([^|]+?) \| ([^|]+?) \|/gm)]
    .map(([, name, status]) => [name.trim(), status.trim()])
  const statusByName = new Map(roadmapRows)

  for (const phase of ['3A', '3B–3K', '3L', '3M']) {
    if (statusByName.get(phase) !== 'CLOSED') errors.push(`${phase} must remain CLOSED during 3N`)
  }

  const phase3N = statusByName.get('3N')
  const phase3O = statusByName.get('3O')
  if (phase3N === 'NEXT / NOT STARTED') {
    if (phase3O !== 'NOT STARTED') errors.push('3O must remain NOT STARTED before 3N closure')
  } else if (phase3N === 'CLOSED') {
    if (!['NEXT / NOT STARTED', 'OPEN / ACTIVE', 'CLOSED'].includes(phase3O)) {
      errors.push('3O must be NEXT / NOT STARTED, OPEN / ACTIVE, or CLOSED after 3N closure')
    }
  } else {
    errors.push(`3N has illegal verification-stage status: ${phase3N ?? 'missing'}`)
  }

  const phaseC018 = statusByName.get('C-018')
  if (phaseC018 === 'OPEN / RATIFICATION REVIEW') {
    if (!(phase3N === 'CLOSED' && phase3O === 'CLOSED')) {
      errors.push('C-018 must remain NOT RATIFIED until 3O closure')
    }
  } else if (phaseC018 === 'RATIFIED / OPERATOR RATIFIED') {
    if (!(phase3N === 'CLOSED' && phase3O === 'CLOSED')) {
      errors.push('C-018 ratification requires 3N and 3O CLOSED')
    }
  } else if (phaseC018 !== 'NOT RATIFIED') {
    errors.push(`C-018 has illegal post-3N status: ${phaseC018 ?? 'missing'}`)
  }
  const architectureProgramClosed = phase3N === 'CLOSED' && phase3O === 'CLOSED' && phaseC018 === 'RATIFIED / OPERATOR RATIFIED'
  if (!architectureProgramClosed && statusByName.get('Product implementation') !== 'BLOCKED') {
    errors.push('Product implementation must remain BLOCKED until 3N, 3O and C-018 are closed')
  }

  const staleSpendWording = 'provider call occurring without spend reservation'
  if (architecture.includes(staleSpendWording) || contract.includes(staleSpendWording)) {
    errors.push('superseded model-spend reservation wording reappeared after 3L-R1')
  }

  // Historical section-46 minimum and contract/execution routing audit.
  const invariantSection = sectionBetween(
    architecture,
    '## 46. Verification invariants carried into 3N / 3O',
    '## 47. Reopen triggers by family',
    'section-46 invariant'
  )
  const declaredInvariantCount = Number(invariantSection.match(/Accepted explicit minimum count = (\d+)/)?.[1] ?? NaN)
  const invariantMatch = invariantSection.match(/```text\s*([\s\S]*?)```/)
  const architectureRoutes = invariantMatch
    ? invariantMatch[1].split('\n').map(line => line.trim()).filter(Boolean).map(line => {
        const separator = line.indexOf(' | ')
        return separator < 0 ? { route: '', falsifier: line } : { route: line.slice(0, separator), falsifier: line.slice(separator + 3) }
      })
    : []
  if (!Number.isFinite(declaredInvariantCount) || architectureRoutes.length !== declaredInvariantCount) {
    errors.push(`section-46 minimum falsifier count changed: projected=${architectureRoutes.length}, declared=${declaredInvariantCount}`)
  }
  if (new Set(architectureRoutes.map(row => row.falsifier)).size !== architectureRoutes.length) {
    errors.push('section-46 minimum contains duplicate falsifiers')
  }

  const routeRows = [...contract.matchAll(/^\| (3N-V\d{2}) \| ([A-Z0-9_]+) \| ([A-Z0-9_]+) \| (.+?) \|$/gm)]
    .map(([, id, contractStage, executionStage, falsifier]) => ({ id, contractStage, executionStage, falsifier }))
  if (routeRows.length !== architectureRoutes.length) {
    errors.push(`3N routing table must contain ${architectureRoutes.length} explicit minimum falsifiers; found ${routeRows.length}`)
  }
  const routeById = new Map()
  for (const row of routeRows) {
    if (routeById.has(row.id)) errors.push(`duplicate 3N routing id: ${row.id}`)
    routeById.set(row.id, row)
  }

  for (let index = 0; index < architectureRoutes.length; index += 1) {
    const id = `3N-V${String(index + 1).padStart(2, '0')}`
    const source = architectureRoutes[index]
    const [expectedContractStage, expectedExecutionStage] = source.route.includes('→')
      ? source.route.split('→')
      : [source.route, source.route]
    const row = routeById.get(id)
    if (!row) {
      errors.push(`missing 3N routing id: ${id}`)
      continue
    }
    if (row.contractStage !== expectedContractStage || row.executionStage !== expectedExecutionStage) {
      errors.push(`${id} routing differs from architecture authority: expected ${expectedContractStage}→${expectedExecutionStage}; got ${row.contractStage}→${row.executionStage}`)
    }
    if (row.falsifier !== source.falsifier) errors.push(`${id} falsifier text differs from architecture authority`)
  }

  // Historical downstream proof-family and owner-intake routing audit.
  const proofFamilySection = sectionBetween(
    architecture,
    '## 42. Downstream proof families not pulled artificially into 3L',
    '## 43. Explicit future seams — no dormant machinery',
    'downstream proof family'
  )
  const proofFamilyMatch = proofFamilySection.match(/Examples:\s*```text\s*([\s\S]*?)```/)
  const architectureProofFamilies = proofFamilyMatch
    ? proofFamilyMatch[1].split('\n').map(line => line.trim()).filter(Boolean)
    : []
  const contractProofSection = sectionBetween(
    contract,
    '## Downstream proof-family coverage',
    '## Current 3N-routed obligation intake',
    '3N downstream proof-family'
  )
  const contractProofRows = [...contractProofSection.matchAll(/^\| ([^|]+?) \| ([^|]+?) \|$/gm)]
    .filter(([, family]) => family.trim() !== 'Proof family' && !family.trim().startsWith('---'))
    .map(([, family, route]) => ({ family: family.trim(), route: route.trim() }))
  if (!sameSet(contractProofRows.map(row => row.family), architectureProofFamilies)) {
    errors.push(`downstream proof-family coverage missing or extra: architecture=${architectureProofFamilies.length}, contract=${contractProofRows.length}`)
  }
  for (const row of contractProofRows) {
    if (!['FIRST_BUILD', 'FIRST_PRODUCTION', '3O_CONTRACT → FIRST_BUILD'].includes(row.route)) {
      errors.push(`invalid downstream proof-family route for ${row.family}: ${row.route}`)
    }
  }

  const sourceIntake = []
  const phase3MRoute = phase3M.match(/^- \*\*3N:\*\* (.+)\.$/m)
  if (!phase3MRoute) {
    errors.push('3M current 3N routing is missing')
  } else {
    const obligations = phase3MRoute[1]
      .split(', ')
      .map(value => normalize(value.replace(/^and /, '')))
      .filter(Boolean)
    for (const obligation of obligations) sourceIntake.push(`3M closure::${obligation}`)
  }

  const cr1Obligation = 'current-authority serialization × owner isolation'
  if (!data.includes('3N/3O must prove both sides together')) {
    errors.push('CR-1 current 3N routing is missing')
  } else {
    sourceIntake.push(`data CR-1::${cr1Obligation}`)
  }

  for (const obligation of ['architecture-wide duplicate-authority proof', 'architecture-wide deciding-evidence completeness']) {
    if (!managedQualification.includes(`${obligation}`) || !managedQualification.includes('→ 3N/3O')) {
      errors.push(`managed-execution current 3N routing is missing: ${obligation}`)
    } else {
      sourceIntake.push(`managed qualification::${obligation}`)
    }
  }

  const intakeSection = sectionBetween(
    contract,
    '## Current 3N-routed obligation intake',
    '## Lead global-coherence challenge',
    'current 3N-routed obligation intake'
  )
  const intakeRows = [...intakeSection.matchAll(/^\| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \|$/gm)]
    .filter(([, source]) => source.trim() !== 'Source' && !source.trim().startsWith('---'))
    .map(([, source, obligation]) => `${normalize(source)}::${normalize(obligation)}`)
  if (!sameSet(intakeRows, sourceIntake)) {
    errors.push(`3N-routed obligation intake differs from current owners: owners=${sourceIntake.length}, contract=${intakeRows.length}`)
  }

  if (!contract.includes('explicit operator closure authority') || !contract.includes('`3N = CLOSED`') || !contract.includes('`3O = NEXT / NOT STARTED`')) {
    errors.push('3N closure gate does not bind operator authority to the roadmap transition')
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  const historicalSummary = historical ? ' with historical phase and routing audit' : ''
  console.log(`Architecture verification passed${historicalSummary} (${actualOwners.length} semantic owners; ${actualL7.length} dependency flows; data ${actualRecordCount} records/${fkRows.length} Tier-2 FKs).`)
}
