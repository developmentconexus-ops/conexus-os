import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const npmCli = process.env.CONEXUS_NPM_CLI
if (!npmCli) throw new Error('CONEXUS_NPM_CLI must name the admitted npm 12.0.2 CLI')

const here = dirname(fileURLToPath(import.meta.url))
const fixture = resolve(here, 'fixtures/scripted-dependency')
const runRoot = mkdtempSync(resolve(tmpdir(), 'conexus-r1f-script-policy-'))
const results = []

const npm = (cwd, args) => spawnSync(process.execPath, [npmCli, ...args], {
  cwd,
  encoding: 'utf8',
  env: {
    ...process.env,
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
  },
})

try {
  for (const policy of ['unreviewed', 'denied', 'allowed']) {
    const root = resolve(runRoot, policy)
    cpSync(fixture, resolve(root, 'fixture'), { recursive: true })
    const manifest = {
      name: `conexus-r1f-script-policy-${policy}`,
      version: '0.0.0',
      private: true,
      dependencies: { 'conexus-r1f-scripted-negative-fixture': 'file:./fixture' },
    }
    if (policy !== 'unreviewed') {
      manifest.allowScripts = { 'file:./fixture': policy === 'allowed' }
    }
    writeFileSync(resolve(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)

    const lock = npm(root, ['install', '--package-lock-only', '--ignore-scripts'])
    assert.equal(lock.status, 0, lock.stderr || lock.stdout)
    const install = npm(root, ['ci', '--strict-allow-scripts'])
    const marker = existsSync(resolve(root, 'node_modules/conexus-r1f-scripted-negative-fixture/install-script-fired'))

    if (policy === 'unreviewed') {
      assert.notEqual(install.status, 0, 'unreviewed lifecycle script must fail strict preflight')
      assert.match(`${install.stdout}\n${install.stderr}`, /ESTRICTALLOWSCRIPTS|not covered by allowScripts/i)
      assert.equal(marker, false)
    } else if (policy === 'denied') {
      assert.equal(install.status, 0, install.stderr || install.stdout)
      assert.equal(marker, false, 'explicit deny must skip the script')
    } else {
      assert.equal(install.status, 0, install.stderr || install.stdout)
      assert.equal(marker, true, 'explicit allow must run the reviewed script')
    }

    results.push({ policy, exitCode: install.status, marker, verdict: 'PASS' })
  }
} finally {
  rmSync(runRoot, { recursive: true, force: true })
}

process.stdout.write(`${JSON.stringify({
  kind: 'conexus.r1f.install-script-policy-negative/v1',
  results,
  cleanup: existsSync(runRoot) ? 'FAIL' : 'PASS',
  verdict: 'PASS',
}, null, 2)}\n`)
