import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const sourcePath = 'contracts/technical/hub-database-roles.json'
const targetPath = 'apps/hub/src/platform/hub-roles.generated.ts'

const fail = (code, detail) => {
  throw new Error(detail ? `${code}: ${detail}` : code)
}

const readSource = () => {
  const text = readFileSync(resolve(repositoryRoot, sourcePath), 'utf8')
  const digest = createHash('sha256').update(text).digest('hex')
  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed.roles) || parsed.roles.length === 0) fail('ROLE_REGISTER_EMPTY', sourcePath)
  return { digest, roles: parsed.roles }
}

const refuseDuplicates = (roles) => {
  const seenRoles = new Set()
  const seenCapabilities = new Set()
  const seenVariables = new Set()
  for (const row of roles) {
    if (seenRoles.has(row.role)) fail('ROLE_REGISTER_DUPLICATE_ROLE', row.role)
    if (seenCapabilities.has(row.capability)) fail('ROLE_REGISTER_DUPLICATE_CAPABILITY', row.capability)
    if (seenVariables.has(row.passwordFileVariable)) fail('ROLE_REGISTER_DUPLICATE_PASSWORD_FILE', row.passwordFileVariable)
    seenRoles.add(row.role)
    seenCapabilities.add(row.capability)
    seenVariables.add(row.passwordFileVariable)
  }
}

const refuseIncompleteRow = (roles) => {
  for (const row of roles) {
    if (!row.role?.startsWith('hub_')) fail('ROLE_REGISTER_ROLE_NAME_REFUSED', String(row.role))
    if (!row.capability) fail('ROLE_REGISTER_CAPABILITY_MISSING', row.role)
    if (!row.passwordFileVariable?.startsWith('CONEXUS_DB_')) fail('ROLE_REGISTER_PASSWORD_FILE_REFUSED', row.role)
    if (!Array.isArray(row.connectsFrom) || row.connectsFrom.length === 0) fail('ROLE_REGISTER_CONNECTS_FROM_MISSING', row.role)
    if (row.optional !== undefined && row.optional !== true) fail('ROLE_REGISTER_OPTIONAL_REFUSED', row.role)
  }
}

const renderRow = (row) => {
  const members = [
    `role: ${JSON.stringify(row.role)}`,
    `capability: ${JSON.stringify(row.capability)}`,
    `passwordFileVariable: ${JSON.stringify(row.passwordFileVariable)}`,
    ...(row.roleVariable ? [`roleVariable: ${JSON.stringify(row.roleVariable)}`] : []),
    ...(row.optional ? ['optional: true'] : []),
    `connectsFrom: ${JSON.stringify(row.connectsFrom)}`,
  ]
  return `  Object.freeze({ ${members.join(', ')} }),`
}

export const renderRegister = ({ digest, roles }) => {
  refuseIncompleteRow(roles)
  refuseDuplicates(roles)
  const capabilities = roles.map((row) => `  ${row.role}: ${JSON.stringify(row.capability)},`).join('\n')
  return [
    `// GENERATED from ${sourcePath} by scripts/generate-hub-role-register.mjs. Do not edit.`,
    '',
    `export const HUB_ROLE_REGISTER_DIGEST = ${JSON.stringify(digest)}`,
    '',
    'export type HubRoleRow = Readonly<{',
    '  role: string',
    '  capability: string',
    '  passwordFileVariable: string',
    '  roleVariable?: string',
    '  // Connects only when its feature is configured, so its absence is not a census finding.',
    '  optional?: true',
    '  connectsFrom: readonly string[]',
    '}>',
    '',
    'export const HUB_ROLES: readonly HubRoleRow[] = Object.freeze([',
    ...roles.map(renderRow),
    '])',
    '',
    'export const CAPABILITY_BY_ROLE: Readonly<Record<string, string>> = Object.freeze({',
    capabilities,
    '})',
    '',
  ].join('\n')
}

export const generateRegister = () => renderRegister(readSource())

const roleOnLine = (line) => line.match(/role: "(hub_[a-z0-9_]+)"/)?.[1] ?? line.match(/^ {2}(hub_[a-z0-9_]+):/)?.[1] ?? null

// A drift report that names only the file sends a reader to diff 40 lines by hand.
export const describeDrift = (current, rendered) => {
  if (current === rendered) return null
  const currentLines = current.split('\n')
  const renderedLines = rendered.split('\n')
  for (let index = 0; index < Math.max(currentLines.length, renderedLines.length); index += 1) {
    if ((currentLines[index] ?? '').startsWith('export const HUB_ROLE_REGISTER_DIGEST')) continue
    if (currentLines[index] === renderedLines[index]) continue
    const role = roleOnLine(currentLines[index] ?? '') ?? roleOnLine(renderedLines[index] ?? '')
    return role ? `${targetPath} line ${index + 1}, role ${role}` : `${targetPath} line ${index + 1}`
  }
  return targetPath
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const rendered = generateRegister()
  const target = resolve(repositoryRoot, targetPath)
  if (process.argv.includes('--check')) {
    const drift = describeDrift(readFileSync(target, 'utf8'), rendered)
    if (drift) fail('ROLE_REGISTER_PROJECTION_DRIFT', drift)
    process.stdout.write(`${JSON.stringify({ verdict: 'CURRENT', target: targetPath })}\n`)
  } else {
    writeFileSync(target, rendered)
    process.stdout.write(`${JSON.stringify({ verdict: 'WRITTEN', target: targetPath })}\n`)
  }
}
