import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { checkImportLaw } from '../../scripts/check-import-law.mjs'

const REQUIRED_CI_RUN_STEPS = [
  'npm ci',
  'npx --no-install playwright install --with-deps chromium',
  'npm run r1:s2:generate',
  'git diff --exit-code -- apps/hub/src/generated/s2-routes.ts apps/web/src/generated/workspace-client.ts',
  'npm run r1:s2:hub:typecheck',
  'npm run r1:s2:http',
  'node --test --test-concurrency=1 tests/implementation/r1-s2-reads.test.mjs',
  'node --test --test-concurrency=1 tests/repository/import-law.test.mjs',
  'npx --no-install biome check apps/hub/src apps/web/src packages/canonical-json/src packages/profile-compiler/src scripts/check-import-law.mjs scripts/generate-r1-s2-contracts.mjs tests/implementation/r1-s2-http.test.mjs tests/implementation/r1-s2-reads.test.mjs tests/repository/import-law.test.mjs',
  'bash -n tests/implementation/r1-s2-live-runner.sh && node --check tests/implementation/r1-s2-live-setup.mjs && node --check tests/implementation/r1-s2-live-browser.spec.mjs',
  'npm run r1:a0:web:typecheck',
  'npm run r1:r1c14:native:check',
  'npm run r1:s6:p0:check',
  'npm run r1:s6:p0:postgres',
  'npm run r1:s6:p1:check',
  'npm run r1:s6:p1:postgres',
  'npm run r1:s6:p2:check',
  'npm run r1:s6:p3:check',
  'npm run r1:s6:p5:check',
  'npm run r1:s6:closure:composed',
  'npm run verify',
]
const REQUIRED_POSTGRES_SERVICE = 'image: postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'

function assertRequiredCiWiring(workflow) {
  let previousIndex = -1
  for (const command of REQUIRED_CI_RUN_STEPS) {
    const line = `      - run: ${command}`
    const matches = [...workflow.matchAll(new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'gm'))]
    assert.equal(matches.length, 1, `required CI step must occur exactly once: ${command}`)
    assert.ok(matches[0].index > previousIndex, `required CI step is out of order: ${command}`)
    previousIndex = matches[0].index
  }
  assert.equal(workflow.split(REQUIRED_POSTGRES_SERVICE).length - 1, 1,
    'required CI PostgreSQL identity must occur exactly once')
}

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

test('required CI executes every A0-P4 objective proof in order', () => {
  const workflow = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/verify.yml'), 'utf8')
  assertRequiredCiWiring(workflow)

  const withoutImportLaw = workflow.replace(
    '      - run: node --test --test-concurrency=1 tests/repository/import-law.test.mjs\n',
    '',
  )
  assert.throws(
    () => assertRequiredCiWiring(withoutImportLaw),
    /required CI step must occur exactly once: node --test/,
  )

  const substitutedPostgres = workflow.replace(REQUIRED_POSTGRES_SERVICE,
    'image: postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297')
  assert.throws(() => assertRequiredCiWiring(substitutedPostgres), /PostgreSQL identity/)
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
