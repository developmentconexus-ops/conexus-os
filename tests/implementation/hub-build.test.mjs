import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

import { resolveHubBuild } from './hub-build.mjs'

const hubBuildModuleUrl = new URL('./hub-build.mjs', import.meta.url).href

function makeFixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'hub-build-fixture-'))
  const sourceDir = resolve(root, 'src')
  mkdirSync(sourceDir, { recursive: true })
  writeFileSync(resolve(sourceDir, 'server.ts'), 'export const ok = 1\n')
  const tsconfigPath = resolve(root, 'tsconfig.json')
  writeFileSync(tsconfigPath, JSON.stringify({ extends: './tsconfig.base.json' }))
  const baseTsconfigPath = resolve(root, 'tsconfig.base.json')
  writeFileSync(baseTsconfigPath, JSON.stringify({ compilerOptions: { strict: true } }))
  const cacheDir = resolve(root, 'cache')
  return { root, sourceDir, tsconfigPath, baseTsconfigPath, cacheDir }
}

function fakeCompile(tmpDir) {
  writeFileSync(resolve(tmpDir, 'server.js'), 'export const ok = 1\n')
}

test('two concurrent child processes produce one compile and the same directory', async () => {
  const fixture = makeFixture()
  const logFile = resolve(fixture.root, 'compile-log.txt')
  writeFileSync(logFile, '')

  const childSource = `
import { writeFileSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveHubBuild } from ${JSON.stringify(hubBuildModuleUrl)}

const directory = resolveHubBuild({
  sourceDir: ${JSON.stringify(fixture.sourceDir)},
  tsconfigPath: ${JSON.stringify(fixture.tsconfigPath)},
  baseTsconfigPath: ${JSON.stringify(fixture.baseTsconfigPath)},
  cacheDir: ${JSON.stringify(fixture.cacheDir)},
  typescriptVersion: 'fixture-version',
  lockPollMs: 20,
  lockWaitMs: 10000,
  env: {},
  compile(tmpDir) {
    appendFileSync(${JSON.stringify(logFile)}, String(process.pid) + '\\n')
    const until = Date.now() + 250
    while (Date.now() < until) {}
    writeFileSync(resolve(tmpDir, 'server.js'), 'export const ok = 1\\n')
  },
})
process.stdout.write(directory)
`
  const childFile = resolve(fixture.root, 'child.mjs')
  writeFileSync(childFile, childSource)

  const runChild = () => new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [childFile], { encoding: 'utf8' })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('close', code => {
      if (code !== 0) reject(new Error(`child exited ${code}: ${stderr}`))
      else resolvePromise(stdout)
    })
  })

  const [directoryA, directoryB] = await Promise.all([runChild(), runChild()])

  assert.equal(directoryA, directoryB)
  assert.equal(existsSync(resolve(directoryA, 'server.js')), true)
  const logLines = readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
  assert.equal(logLines.length, 1)

  rmSync(fixture.root, { recursive: true, force: true })
})

test('a changed source file produces a different build directory', () => {
  const fixture = makeFixture()

  const directoryBefore = resolveHubBuild({
    sourceDir: fixture.sourceDir,
    tsconfigPath: fixture.tsconfigPath,
    baseTsconfigPath: fixture.baseTsconfigPath,
    cacheDir: fixture.cacheDir,
    typescriptVersion: 'fixture-version',
    env: {},
    compile: fakeCompile,
  })
  assert.equal(existsSync(resolve(directoryBefore, 'server.js')), true)

  writeFileSync(resolve(fixture.sourceDir, 'server.ts'), 'export const ok = 2\n')

  const directoryAfter = resolveHubBuild({
    sourceDir: fixture.sourceDir,
    tsconfigPath: fixture.tsconfigPath,
    baseTsconfigPath: fixture.baseTsconfigPath,
    cacheDir: fixture.cacheDir,
    typescriptVersion: 'fixture-version',
    env: {},
    compile: fakeCompile,
  })

  assert.notEqual(directoryAfter, directoryBefore)
  assert.equal(existsSync(resolve(directoryAfter, 'server.js')), true)

  rmSync(fixture.root, { recursive: true, force: true })
})

test('a stale lock from a dead PID is taken over instead of waited out', () => {
  const fixture = makeFixture()

  const hashProbe = resolveHubBuild({
    sourceDir: fixture.sourceDir,
    tsconfigPath: fixture.tsconfigPath,
    baseTsconfigPath: fixture.baseTsconfigPath,
    cacheDir: fixture.cacheDir,
    typescriptVersion: 'fixture-version',
    env: {},
    compile: fakeCompile,
  })
  rmSync(hashProbe, { recursive: true, force: true })

  const deadChild = spawnSync(process.execPath, ['-e', 'process.exit(0)'])
  const deadPid = deadChild.pid
  assert.ok(Number.isInteger(deadPid))

  const lockDir = `${hashProbe}.lock`
  mkdirSync(lockDir, { recursive: true })
  writeFileSync(resolve(lockDir, 'pid'), String(deadPid))

  let compiled = false
  const directory = resolveHubBuild({
    sourceDir: fixture.sourceDir,
    tsconfigPath: fixture.tsconfigPath,
    baseTsconfigPath: fixture.baseTsconfigPath,
    cacheDir: fixture.cacheDir,
    typescriptVersion: 'fixture-version',
    env: {},
    lockPollMs: 10,
    lockWaitMs: 3000,
    compile(tmpDir) {
      compiled = true
      fakeCompile(tmpDir)
    },
  })

  assert.equal(directory, hashProbe)
  assert.equal(compiled, true)
  assert.equal(existsSync(lockDir), false)
  assert.equal(existsSync(resolve(directory, 'server.js')), true)

  rmSync(fixture.root, { recursive: true, force: true })
})

test('CONEXUS_HUB_BUILD wins over compiling', () => {
  const sharedDir = mkdtempSync(resolve(tmpdir(), 'hub-build-shared-'))
  writeFileSync(resolve(sharedDir, 'server.js'), 'export const ok = 1\n')

  const directory = resolveHubBuild({
    env: { CONEXUS_HUB_BUILD: sharedDir },
    compile: () => assert.fail('CONEXUS_HUB_BUILD must skip compiling'),
  })

  assert.equal(directory, sharedDir)

  rmSync(sharedDir, { recursive: true, force: true })
})
