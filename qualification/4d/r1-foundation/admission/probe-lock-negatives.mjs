import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const npmCli = process.env.CONEXUS_NPM_CLI
if (!npmCli) throw new Error('CONEXUS_NPM_CLI must name the admitted npm 12.0.2 CLI')

const admissionRoot = dirname(fileURLToPath(import.meta.url))
const qualificationRoot = resolve(admissionRoot, '..')
const validator = resolve(admissionRoot, 'validate-admission.mjs')
const runRoot = mkdtempSync(resolve(tmpdir(), 'conexus-r1f-lock-negatives-'))
const results = []

const prepare = name => {
  const root = resolve(runRoot, name)
  mkdirSync(root)
  cpSync(resolve(qualificationRoot, 'package.json'), resolve(root, 'package.json'), { recursive: true })
  cpSync(resolve(qualificationRoot, 'package-lock.json'), resolve(root, 'package-lock.json'))
  cpSync(resolve(qualificationRoot, '.npmrc'), resolve(root, '.npmrc'))
  return root
}

const run = (cwd, command, args) => spawnSync(command, args, {
  cwd,
  encoding: 'utf8',
  env: {
    ...process.env,
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
  },
})

const expectFailure = (name, result, pattern) => {
  assert.notEqual(result.status, 0, `${name} unexpectedly passed`)
  assert.match(`${result.stdout}\n${result.stderr}`, pattern)
  results.push({ name, exitCode: result.status, verdict: 'PASS' })
}

try {
  {
    const root = prepare('floating-selector')
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    manifest.devDependencies.ajv = '^8.20.0'
    writeFileSync(resolve(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    expectFailure('floating-selector', run(root, process.execPath, [validator, root]), /declaration must equal approved pin|must not float/)
  }
  {
    const root = prepare('alternate-registry')
    const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'))
    lock.packages['node_modules/ajv'].resolved = lock.packages['node_modules/ajv'].resolved.replace('registry.npmjs.org', 'registry.example.invalid')
    writeFileSync(resolve(root, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
    expectFailure('alternate-registry', run(root, process.execPath, [validator, root]), /alternate registry/)
  }
  {
    const root = prepare('manifest-lock-mismatch')
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    manifest.devDependencies.ajv = '8.17.1'
    writeFileSync(resolve(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    expectFailure(
      'manifest-lock-mismatch',
      run(root, process.execPath, [npmCli, 'ci', '--ignore-scripts']),
      /package\.json and package-lock\.json are in sync|Missing:|Invalid:/i,
    )
  }
  {
    const root = prepare('integrity-mismatch')
    const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'))
    lock.packages['node_modules/jsonc-parser'].integrity = `sha512-${Buffer.alloc(64).toString('base64')}`
    writeFileSync(resolve(root, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
    expectFailure(
      'integrity-mismatch',
      run(root, process.execPath, [npmCli, 'ci', '--ignore-scripts', '--cache', resolve(root, 'cache')]),
      /EINTEGRITY|integrity checksum failed|integrity/i,
    )
  }
} finally {
  rmSync(runRoot, { recursive: true, force: true })
}

process.stdout.write(`${JSON.stringify({
  kind: 'conexus.r1f.lock-negative-controls/v1',
  results,
  verdict: 'PASS',
}, null, 2)}\n`)
