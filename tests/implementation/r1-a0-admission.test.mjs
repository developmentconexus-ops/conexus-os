import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const readJson = (path) => JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'))
const sha256 = (path) => createHash('sha256').update(readFileSync(resolve(repositoryRoot, path))).digest('hex')
const canonicalValue = (value) => {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalValue)
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}
const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8')
const tscPath = resolve(repositoryRoot, 'node_modules/typescript/bin/tsc')

const readConfig = (path) => {
  const absolute = resolve(repositoryRoot, path)
  const loaded = ts.readConfigFile(absolute, ts.sys.readFile)
  assert.equal(loaded.error, undefined)
  return ts.parseJsonConfigFileContent(loaded.config, ts.sys, resolve(absolute, '..'), undefined, absolute)
}

const runTsc = (args) => {
  const result = spawnSync(process.execPath, [tscPath, '--pretty', 'false', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const strictNodeArgs = [
  '--noEmit',
  '--target', 'ES2022',
  '--module', 'NodeNext',
  '--moduleResolution', 'NodeNext',
  '--strict',
  '--noUncheckedIndexedAccess',
  '--exactOptionalPropertyTypes',
  '--useUnknownInCatchVariables',
  '--types', 'node',
]

test('A0 foundation pin binds the exact admitted type dependency and lock', () => {
  const manifest = readJson('docs/evidence/4d/4d-r1-a0-foundation-pin-manifest.json')
  const packageJson = readJson('package.json')
  const lock = readJson('package-lock.json')
  const installed = readJson('node_modules/@types/pg/package.json')
  const target = manifest.admittedDependency
  const locked = lock.packages['node_modules/@types/pg']

  assert.equal(manifest.kind, 'conexus.r1-a0-foundation-pin-manifest/v1')
  assert.deepEqual(manifest.decidingRuntime, { node: '24.20.0', npm: '12.0.2', typescript: '6.0.2' })
  assert.equal(manifest.lockfileSha256, sha256('package-lock.json'))
  assert.equal(packageJson.devDependencies[target.name], target.version)
  assert.equal(installed.version, target.version)
  assert.equal(installed.license, target.license)
  assert.equal(locked.version, target.version)
  assert.equal(locked.resolved, target.resolved)
  assert.equal(locked.integrity, target.integrity)
  assert.equal(locked.dev, true)
  assert.equal(target.class, 'DEV_TYPE_ONLY')
  assert.equal(target.installScripts, false)
  assert.deepEqual(manifest.proofProtocols.map(({ id }) => id).sort(), [
    'A0:FOUNDATION-PIN',
    'A0:HUB-TYPECHECK',
    'A0:MIGRATION-CUSTODY',
    'A0:OPENID-DECLARATION',
    'A0:OPENID-RED',
    'A0:WEB-TYPECHECK',
    'G0:VERIFY',
    'S1:HTTP',
  ])
  for (const entry of manifest.proofProtocols) {
    assert.equal(createHash('sha256').update(canonicalBytes(entry.protocol)).digest('hex'), entry.protocolDigest)
    assert.equal(entry.protocol.id, entry.id)
  }
})

test('Hub strict options compile the future named request and database surfaces', () => {
  const parsed = readConfig('apps/hub/tsconfig.json')
  assert.deepEqual(parsed.errors.map(({ code }) => code), parsed.fileNames.length === 0 ? [18003] : [])
  assert.equal(parsed.options.strict, true)
  assert.equal(parsed.options.noUncheckedIndexedAccess, true)
  assert.equal(parsed.options.exactOptionalPropertyTypes, true)
  assert.equal(parsed.options.useUnknownInCatchVariables, true)
  assert.equal(parsed.options.skipLibCheck, true)
  assert.equal(parsed.options.module, ts.ModuleKind.NodeNext)
  assert.equal(parsed.options.moduleResolution, ts.ModuleResolutionKind.NodeNext)

  const temporary = mkdtempSync(resolve(repositoryRoot, 'tests/implementation/a0-hub-types-'))
  try {
    const greenPath = resolve(temporary, 'hub-surface.ts')
    writeFileSync(greenPath, `
      import type { PoolClient, QueryResultRow } from 'pg'
      import type { Configuration } from 'openid-client'
      type OwnerId = 'IAM-01' | 'IAM-02' | 'IAM-03'
      type Route = Readonly<{ ownerId: OwnerId; method: 'GET' | 'POST'; path: string }>
      const routes = {
        'IAM-01': { ownerId: 'IAM-01', method: 'GET', path: '/session' },
        'IAM-02': { ownerId: 'IAM-02', method: 'POST', path: '/session/end' },
        'IAM-03': { ownerId: 'IAM-03', method: 'POST', path: '/accounts' },
      } satisfies Record<OwnerId, Route>
      type IdentityAccessModule = Readonly<{
        registerIdentityAccessRoutes(): Promise<void>
        resolveCurrentSession(token: string): Promise<Readonly<{ accountId: string }> | null>
        close(): Promise<void>
      }>
      export async function proveFutureSurface(client: PoolClient, configuration: Configuration): Promise<IdentityAccessModule> {
        const result = await client.query<QueryResultRow & { account_id: string }>('select account_id')
        const first = result.rows[0]
        if (first) void first.account_id
        void configuration.serverMetadata()
        void routes['IAM-01'].path
        return {
          async registerIdentityAccessRoutes() {},
          async resolveCurrentSession(token) { return token ? { accountId: token } : null },
          async close() {},
        }
      }
    `)
    const green = runTsc([...strictNodeArgs, '--skipLibCheck', 'true', greenPath])
    assert.equal(green.status, 0, green.output)

    const redPath = resolve(temporary, 'strict-red.ts')
    writeFileSync(redPath, `
      export const unchecked = (values: string[]) => values[0].toUpperCase()
      export const implicit = (value) => value
    `)
    const red = runTsc([...strictNodeArgs, '--skipLibCheck', 'true', redPath])
    assert.notEqual(red.status, 0)
    assert.match(red.output, /TS2532/)
    assert.match(red.output, /TS7006/)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('openid-client waiver is exact, fail-closed and has a distinct RED control', () => {
  const manifest = readJson('docs/evidence/4d/4d-r1-a0-foundation-pin-manifest.json')
  const waiver = manifest.declarationWaiver
  const declarationPath = resolve(repositoryRoot, waiver.declarationPath)
  assert.equal(sha256(waiver.declarationPath), waiver.declarationSha256)

  const diagnostics = runTsc([...strictNodeArgs, '--skipLibCheck', 'false', declarationPath])
  assert.notEqual(diagnostics.status, 0)
  assert.match(diagnostics.output, new RegExp(`openid-client[/\\\\]build[/\\\\]index\\.d\\.ts.*TS${waiver.expectedDiagnostic.code}`))
  assert.equal(diagnostics.output.includes(`Class '${waiver.expectedDiagnostic.class}'`), true)
  assert.equal(diagnostics.output.includes(`interface '${waiver.expectedDiagnostic.interface}'`), true)
  assert.equal(diagnostics.output.includes(`property '${waiver.expectedDiagnostic.property}'`), true)
  const waived = runTsc([...strictNodeArgs, '--skipLibCheck', 'true', declarationPath])
  assert.equal(waived.status, 0, waived.output)

  const temporary = mkdtempSync(resolve(repositoryRoot, 'tests/implementation/a0-openid-red-'))
  try {
    const redPath = resolve(temporary, 'dependency-red.d.ts')
    writeFileSync(redPath, `
      declare class DependencyBase { execute(value: string): string }
      declare class DependencyDrift extends DependencyBase { execute(value: number): number }
    `)
    const red = runTsc([...strictNodeArgs, '--skipLibCheck', 'false', declarationPath, redPath])
    assert.notEqual(red.status, 0)
    assert.match(red.output, /TS2420/)
    assert.match(red.output, /TS2416/)
    assert.equal(red.output.includes('DependencyDrift'), true)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('web uses strict Bundler resolution with no declaration waiver', () => {
  const parsed = readConfig('apps/web/tsconfig.json')
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.options.strict, true)
  assert.equal(parsed.options.noUncheckedIndexedAccess, true)
  assert.equal(parsed.options.exactOptionalPropertyTypes, true)
  assert.equal(parsed.options.skipLibCheck, false)
  assert.equal(parsed.options.moduleResolution, ts.ModuleResolutionKind.Bundler)
  const result = runTsc(['--project', 'apps/web/tsconfig.json'])
  assert.equal(result.status, 0, result.output)
})
