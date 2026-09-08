import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { checkImportLaw } from '../../scripts/check-import-law.mjs'

const REQUIRED_POSTGRES_SERVICE = 'image: postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'

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

test('required CI delegates once to the flattened candidate graph', () => {
  const workflow = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/verify.yml'), 'utf8')
  assert.equal(workflow.match(/^ {6}- run: npm run verify$/gm)?.length, 1)
  assert.equal(workflow.match(/^ {6}- run: npm run r1:s2:hub:typecheck$/gm)?.length ?? 0, 0)
  assert.equal(workflow.match(/^ {6}- run: npm run r1:a0:web:typecheck$/gm)?.length ?? 0, 0)
  assert.ok(workflow.includes('npm run verify'))
  assert.equal(workflow.split(REQUIRED_POSTGRES_SERVICE).length - 1, 1,
    'required CI PostgreSQL identity must occur exactly once')
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
    ['IMPORT_PRODUCTION_TO_TEST_TOOLING', { 'apps/hub/src/server.ts': 'import "../../../tests/helper.mjs"' }],
    ['IMPORT_APP_TO_RUNTIME', { 'apps/hub/src/server.ts': 'import "../../../runtime/r1/generated/x.mjs"' }],
    ['IMPORT_BROWSER_TO_SERVER', { 'apps/web/src/main.ts': 'import "fs"' }],
    ['IMPORT_BROWSER_TO_SERVER require branch', { 'apps/web/src/main.ts': 'require("node:path")' }],
    ['IMPORT_GENERATED_TO_OWNER', {
      'apps/hub/src/generated/x.ts': 'import "../future-owner/module.js"',
      'apps/hub/src/future-owner/module.ts': '',
    }],
    ['IMPORT_RUNTIME_TO_COMPILER', {
      'runtime/r1/output.mjs': 'import "../../packages/profile-compiler/src/index.mjs"',
      'packages/profile-compiler/src/index.mjs': '',
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
