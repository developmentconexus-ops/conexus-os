import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { checkImportLaw } from '../../scripts/check-import-law.mjs'

function fixture(files) {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-import-law-'))
  for (const [path, contents] of Object.entries(files)) {
    const absolute = resolve(root, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, contents)
  }
  return root
}

function assertRule(id, files) {
  const root = fixture(files)
  try {
    const violations = checkImportLaw(root)
    assert.ok(violations.some((item) => item.id === id), `${id} did not fire: ${JSON.stringify(violations)}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('real production graph satisfies the import law', () => {
  assert.deepEqual(checkImportLaw(resolve(import.meta.dirname, '../..')), [])
})

test('every import-law RED control fires its named rule', async (suite) => {
  const cases = [
    ['IMPORT_COMPUTED_DYNAMIC', { 'apps/web/src/main.ts': 'const moduleName = "x"; import(moduleName)' }],
    ['IMPORT_COMPUTED_DYNAMIC createRequire branch', {
      'apps/hub/src/platform/config.ts': 'import { createRequire } from "node:module"; createRequire(import.meta.url)',
    }],
    ['IMPORT_ABSOLUTE', { 'apps/hub/src/server.ts': 'import "/apps/hub/src/identity-access/store.js"' }],
    ['IMPORT_RELATIVE_ESCAPE', { 'apps/hub/src/server.ts': 'import "../../../../outside.js"' }],
    ['IMPORT_UNRESOLVED_RELATIVE', { 'apps/web/src/main.ts': 'import "./missing.js"' }],
    ['IMPORT_CASE_MISMATCH', {
      'apps/web/src/main.ts': 'import "./exact.js"',
      'apps/web/src/Exact.ts': '',
    }],
    ['IMPORT_GENERATED_TO_OWNER', {
      'apps/hub/src/generated/x.ts': 'import "../future-owner/module.js"',
      'apps/hub/src/future-owner/module.ts': '',
    }],
    ['IMPORT_OWNER_TO_OWNER', {
      'apps/hub/src/identity-access/module.ts': 'import "../projects/module.js"',
      'apps/hub/src/projects/module.ts': '',
    }],
    ['IMPORT_PACKAGE_DEEP', {
      'apps/hub/src/server.ts': 'import "../../../packages/two/src/internal.mjs"',
      'packages/two/src/internal.mjs': '',
    }],
    ['IMPORT_LAYER_MATRIX server branch', {
      'apps/hub/src/server.ts': 'import "./identity-access/store.js"',
      'apps/hub/src/identity-access/store.ts': '',
    }],
    ['IMPORT_LAYER_MATRIX http branch', {
      'apps/hub/src/http/app.ts': 'import "../platform/postgres.js"',
      'apps/hub/src/platform/postgres.ts': '',
    }],
    ['IMPORT_LAYER_MATRIX routes branch', {
      'apps/hub/src/identity-access/routes.ts': 'import "../platform/postgres.js"',
      'apps/hub/src/platform/postgres.ts': '',
    }],
    ['IMPORT_LAYER_MATRIX store branch', {
      'apps/hub/src/identity-access/store.ts': 'import "../http/problem.js"',
      'apps/hub/src/http/problem.ts': '',
    }],
    ['IMPORT_LAYER_MATRIX workspace routes branch', {
      'apps/hub/src/workspace/routes.ts': 'import "../platform/postgres.js"',
      'apps/hub/src/platform/postgres.ts': '',
    }],
    ['IMPORT_LAYER_MATRIX workspace store branch', {
      'apps/hub/src/workspace/store.ts': 'import "../http/problem.js"',
      'apps/hub/src/http/problem.ts': '',
    }],
    ['IMPORT_LAYER_MATRIX platform branch', {
      'apps/hub/src/platform/postgres.ts': 'import "../http/problem.js"',
      'apps/hub/src/http/problem.ts': '',
    }],
    ['IMPORT_CYCLE', {
      'apps/web/src/a.ts': 'import "./b.js"',
      'apps/web/src/b.ts': 'import "./a.js"',
    }],
    ['IMPORT_CENSUS', { 'apps/uncensused/README.md': 'missing src' }],
  ]
  for (const [label, files] of cases) {
    const id = label.split(' ')[0]
    await suite.test(label, () => assertRule(id, files))
  }
})

const repositoryRoot = resolve(import.meta.dirname, '../..')

const biomeFindings = (path, source) => {
  const probe = resolve(repositoryRoot, path)
  writeFileSync(probe, source)
  try {
    return spawnSync(process.execPath, [resolve(repositoryRoot, 'node_modules/@biomejs/biome/bin/biome'), 'lint', path, '--colors=off'], { cwd: repositoryRoot, encoding: 'utf8' })
  } finally {
    rmSync(probe, { force: true })
  }
}

test('Biome refuses production code that imports tests or scripts, and web code that imports Node', () => {
  for (const [path, source, rule] of [
    ['apps/hub/src/import-probe.ts', 'import "../../../tests/helper.mjs"\nexport const hub = 1\n', 'lint/style/noRestrictedImports'],
    ['packages/brand/src/import-probe.ts', 'import "../../../scripts/tool.mjs"\nexport const brand = 1\n', 'lint/style/noRestrictedImports'],
    ['apps/web/src/import-probe.ts', 'import "node:fs"\nexport const web = 1\n', 'lint/correctness/noNodejsModules'],
  ]) {
    const result = biomeFindings(path, source)
    assert.equal(result.status, 1, `${path} passed`)
    assert.match(result.stdout + result.stderr, new RegExp(rule))
  }
  assert.equal(biomeFindings('apps/hub/src/import-probe.ts', 'import "node:fs"\nexport const hub = 1\n').status, 0)
})
