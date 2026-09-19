// Moves a deployment's environment file and secret files from the phase-named database roles to
// the capability-named ones. It never generates a password, never reads a secret's contents into
// its own output, and prints file names only.
//
// Run it with --apply after migration 059 has been applied, then `npm run db:roles:provision` so
// the new roles take the passwords in those files, then start the Hub and read the connection
// census. Without --apply it reports what it would do and writes nothing.
import { chmodSync, copyFileSync, existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROLE_VARIABLE_RENAMES = Object.freeze([
  { from: 'CONEXUS_DB_WS01_COMMAND_PASSWORD_FILE', to: 'CONEXUS_DB_WORKSPACE_COMMAND_PASSWORD_FILE', fromFile: 'db-ws01-command', toFile: 'db-workspace-command' },
  { from: 'CONEXUS_DB_S2_READ_PASSWORD_FILE', to: 'CONEXUS_DB_WORKSPACE_READ_PASSWORD_FILE', fromFile: 'db-s2-read', toFile: 'db-workspace-read' },
  { from: 'CONEXUS_DB_S3_READ_PASSWORD_FILE', to: 'CONEXUS_DB_PROJECT_READ_PASSWORD_FILE', fromFile: 'db-s3-read', toFile: 'db-project-read' },
  { from: 'CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE', to: 'CONEXUS_DB_PROJECT_COMMAND_PASSWORD_FILE', fromFile: 'db-prj03-command', toFile: 'db-project-command' },
  { from: 'CONEXUS_DB_RB_INGRESS_PASSWORD_FILE', to: 'CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE', fromFile: 'db-rb-ingress', toFile: 'db-builder-ingress' },
  { from: 'CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE', to: 'CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE', fromFile: 'db-rb-executor', toFile: 'db-builder-executor' },
  { from: 'CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE', to: 'CONEXUS_DB_MODEL_CONNECTION_PASSWORD_FILE', fromFile: 'db-r2-connections', toFile: 'db-model-connection' },
])

const fail = (code, detail) => {
  throw new Error(detail ? `${code}: ${detail}` : code)
}

// The same 0600 rule apps/hub/src/platform/secrets.ts and scripts/provision-hub-roles.mjs hold to.
// A symbolic link is refused rather than followed: the file this copies must be the file the
// operator believes it is.
const assertSecretFile = (path) => {
  const entry = lstatSync(path)
  if (entry.isSymbolicLink()) fail('SECRET_FILE_SYMLINK', path)
  if (!entry.isFile()) fail('SECRET_FILE_NOT_REGULAR', path)
  if ((entry.mode & 0o077) !== 0) fail('SECRET_FILE_PERMISSIONS', path)
}

const environmentValues = (text) => {
  const values = new Map()
  for (const line of text.split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (match) values.set(match[1], match[2].trim().replace(/^["']|["']$/g, ''))
  }
  return values
}

// A secret's new name follows its old one: the value in the environment file is the truth about
// where the file lives, and only the part that names the phase changes.
const renamedPath = (path, entry) => {
  const name = basename(path)
  if (!name.includes(entry.fromFile)) return null
  return path.slice(0, path.length - name.length) + name.split(entry.fromFile).join(entry.toFile)
}

export const planCutover = (environmentFile, secretsDirectory) => {
  const text = readFileSync(environmentFile, 'utf8')
  const values = environmentValues(text)
  const copies = []
  const variables = []
  const notes = []
  for (const entry of ROLE_VARIABLE_RENAMES) {
    const oldValue = values.get(entry.from)
    if (oldValue === undefined) {
      if (values.has(entry.to)) notes.push(`${entry.to} already present`)
      continue
    }
    variables.push({ from: entry.from, to: entry.to })
    const source = resolve(secretsDirectory, oldValue)
    const targetPath = renamedPath(source, entry)
    if (targetPath === null) {
      notes.push(`${entry.from} value does not carry ${entry.fromFile}; the variable is renamed and the file is left as it is`)
      continue
    }
    if (!existsSync(source)) fail('SECRET_FILE_MISSING', source)
    assertSecretFile(source)
    copies.push({ source, target: targetPath, state: existsSync(targetPath) ? 'present' : 'copy' })
  }
  return { environmentFile, copies, variables, notes, rewrite: variables.length > 0 }
}

export const applyCutover = (plan, now = new Date()) => {
  for (const copy of plan.copies) {
    if (copy.state === 'present') {
      assertSecretFile(copy.target)
      continue
    }
    copyFileSync(copy.source, copy.target)
    chmodSync(copy.target, 0o600)
  }
  if (!plan.rewrite) return { ...plan, backup: null }

  const text = readFileSync(plan.environmentFile, 'utf8')
  const backup = `${plan.environmentFile}.${now.toISOString().replace(/[:.]/g, '-')}.bak`
  writeFileSync(backup, text, { mode: 0o600 })
  chmodSync(backup, 0o600)
  let next = text
  for (const entry of ROLE_VARIABLE_RENAMES) {
    next = next.split(entry.from).join(entry.to)
    next = next.split(entry.fromFile).join(entry.toFile)
  }
  writeFileSync(plan.environmentFile, next)
  return { ...plan, backup }
}

export const cutover = ({ environmentFile, secretsDirectory, apply, now }) => {
  const plan = planCutover(environmentFile, secretsDirectory)
  const result = apply ? applyCutover(plan, now) : { ...plan, backup: null }
  return {
    verdict: apply ? (plan.rewrite || plan.copies.some(copy => copy.state === 'copy') ? 'APPLIED' : 'CURRENT') : 'DRY_RUN',
    copies: result.copies.map(copy => ({ from: basename(copy.source), to: basename(copy.target), state: copy.state })),
    variables: result.variables,
    notes: result.notes,
    backup: result.backup === null ? null : basename(result.backup),
  }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const positional = process.argv.slice(2).filter(argument => argument !== '--apply')
  if (positional.length !== 2) fail('USAGE', 'cutover-hub-role-names.mjs <environment-file> <secrets-directory> [--apply]')
  process.stdout.write(`${JSON.stringify(cutover({
    environmentFile: resolve(positional[0]),
    secretsDirectory: resolve(positional[1]),
    apply: process.argv.includes('--apply'),
  }), null, 2)}\n`)
}
