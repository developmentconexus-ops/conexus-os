import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { cutover } from '../../scripts/cutover-hub-role-names.mjs'

const SECRETS = [
  ['db-ws01-command', 'workspace-command-secret'],
  ['db-s2-read', 'workspace-read-secret'],
  ['db-s3-read', 'project-read-secret'],
  ['db-prj03-command', 'project-command-secret'],
  ['db-rb-ingress', 'builder-ingress-secret'],
  ['db-rb-executor', 'builder-executor-secret'],
  ['db-r2-connections', 'model-connection-secret'],
]

const pilotShaped = () => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-cutover-'))
  const secrets = join(root, 'secrets')
  mkdirSync(secrets)
  for (const [name, value] of SECRETS) {
    const path = join(secrets, name)
    writeFileSync(path, `${value}\n`, { mode: 0o600 })
    chmodSync(path, 0o600)
  }
  const environmentFile = join(root, 'hub.env')
  writeFileSync(environmentFile, [
    'CONEXUS_DB_HOST=127.0.0.1',
    `CONEXUS_DB_WS01_COMMAND_PASSWORD_FILE=${join(secrets, 'db-ws01-command')}`,
    `CONEXUS_DB_S2_READ_PASSWORD_FILE=${join(secrets, 'db-s2-read')}`,
    `CONEXUS_DB_S3_READ_PASSWORD_FILE=${join(secrets, 'db-s3-read')}`,
    `CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE=${join(secrets, 'db-prj03-command')}`,
    `CONEXUS_DB_RB_INGRESS_PASSWORD_FILE=${join(secrets, 'db-rb-ingress')}`,
    `CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE=${join(secrets, 'db-rb-executor')}`,
    `CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE=${join(secrets, 'db-r2-connections')}`,
    '',
  ].join('\n'), { mode: 0o600 })
  return { root, secrets, environmentFile }
}

test('a dry run reports every rename and writes nothing', () => {
  const { root, secrets, environmentFile } = pilotShaped()
  const before = readFileSync(environmentFile, 'utf8')
  const result = cutover({ environmentFile, secretsDirectory: secrets, apply: false })

  assert.equal(result.verdict, 'DRY_RUN')
  assert.deepEqual(result.copies.map(copy => `${copy.from} -> ${copy.to}`), [
    'db-ws01-command -> db-workspace-command',
    'db-s2-read -> db-workspace-read',
    'db-s3-read -> db-project-read',
    'db-prj03-command -> db-project-command',
    'db-rb-ingress -> db-builder-ingress',
    'db-rb-executor -> db-builder-executor',
    'db-r2-connections -> db-model-connection',
  ])
  assert.equal(readFileSync(environmentFile, 'utf8'), before)
  assert.deepEqual(readdirSync(secrets).sort(), SECRETS.map(([name]) => name).sort())
  assert.equal(readdirSync(root).includes('hub.env'), true)
})

test('an applied cutover copies each secret at 0600, rewrites the variables and keeps a 0600 backup', () => {
  const { secrets, environmentFile } = pilotShaped()
  const result = cutover({ environmentFile, secretsDirectory: secrets, apply: true, now: new Date('2026-09-19T12:00:00.000Z') })

  assert.equal(result.verdict, 'APPLIED')
  assert.equal(result.backup, 'hub.env.2026-09-19T12-00-00-000Z.bak')

  for (const [oldName, value] of SECRETS) {
    const newName = result.copies.find(copy => copy.from === oldName).to
    const path = join(secrets, newName)
    assert.equal(statSync(path).mode & 0o777, 0o600, newName)
    assert.equal(readFileSync(path, 'utf8'), `${value}\n`)
    assert.equal(readFileSync(join(secrets, oldName), 'utf8'), `${value}\n`, 'the old file is left in place')
  }

  const text = readFileSync(environmentFile, 'utf8')
  for (const name of [
    'CONEXUS_DB_WORKSPACE_COMMAND_PASSWORD_FILE', 'CONEXUS_DB_WORKSPACE_READ_PASSWORD_FILE',
    'CONEXUS_DB_PROJECT_READ_PASSWORD_FILE', 'CONEXUS_DB_PROJECT_COMMAND_PASSWORD_FILE',
    'CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE', 'CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE',
    'CONEXUS_DB_MODEL_CONNECTION_PASSWORD_FILE',
  ]) assert.match(text, new RegExp(`^${name}=.*db-`, 'm'))
  for (const name of [
    'CONEXUS_DB_WS01_COMMAND_PASSWORD_FILE', 'CONEXUS_DB_S2_READ_PASSWORD_FILE', 'CONEXUS_DB_S3_READ_PASSWORD_FILE',
    'CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE', 'CONEXUS_DB_RB_INGRESS_PASSWORD_FILE',
    'CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE', 'CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE',
  ]) assert.equal(text.includes(name), false, name)
  assert.equal(statSync(join(environmentFile)).mode & 0o777, 0o600)
  assert.equal(statSync(`${environmentFile}.2026-09-19T12-00-00-000Z.bak`).mode & 0o777, 0o600)
  assert.equal(readFileSync(`${environmentFile}.2026-09-19T12-00-00-000Z.bak`, 'utf8').includes('CONEXUS_DB_S2_READ_PASSWORD_FILE'), true)
})

test('a second run changes nothing and reports the deployment as current', () => {
  const { secrets, environmentFile } = pilotShaped()
  cutover({ environmentFile, secretsDirectory: secrets, apply: true, now: new Date('2026-09-19T12:00:00.000Z') })
  const afterFirst = readFileSync(environmentFile, 'utf8')
  const filesAfterFirst = readdirSync(secrets).sort()

  const second = cutover({ environmentFile, secretsDirectory: secrets, apply: true, now: new Date('2026-09-19T13:00:00.000Z') })

  assert.equal(second.verdict, 'CURRENT')
  assert.equal(second.backup, null)
  assert.deepEqual(second.copies, [])
  assert.equal(readFileSync(environmentFile, 'utf8'), afterFirst)
  assert.deepEqual(readdirSync(secrets).sort(), filesAfterFirst)
})

test('no secret content reaches the output', () => {
  const { secrets, environmentFile } = pilotShaped()
  const printed = JSON.stringify(cutover({ environmentFile, secretsDirectory: secrets, apply: true, now: new Date() }))
  for (const [, value] of SECRETS) assert.equal(printed.includes(value), false, value)
})

test('a secret file wider than 0600 is refused, and so is a symbolic link', () => {
  const wide = pilotShaped()
  chmodSync(join(wide.secrets, 'db-s2-read'), 0o644)
  assert.throws(() => cutover({ environmentFile: wide.environmentFile, secretsDirectory: wide.secrets, apply: true }),
    /SECRET_FILE_PERMISSIONS/)

  const linked = pilotShaped()
  const path = join(linked.secrets, 'db-rb-executor')
  rmSync(path)
  symlinkSync(join(linked.secrets, 'db-rb-ingress'), path)
  assert.throws(() => cutover({ environmentFile: linked.environmentFile, secretsDirectory: linked.secrets, apply: true }),
    /SECRET_FILE_SYMLINK/)
})
