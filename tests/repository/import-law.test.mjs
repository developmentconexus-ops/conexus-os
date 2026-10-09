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
    ['IMPORT_ABSOLUTE', { 'apps/hub/src/server.ts': 'import "/apps/hub/src/identity-access/sessions.js"' }],
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
    ['IMPORT_PACKAGE_DEEP contract by relative path', {
      'apps/web/src/main.ts': 'import "../../../packages/contract/src/index.js"',
      'packages/contract/src/index.ts': '',
    }],
    ['IMPORT_PACKAGE_DEEP contract by package subpath', {
      'apps/hub/src/server.ts': 'import "@conexus/contract/dist/index.js"',
    }],
    ['IMPORT_LAYER_MATRIX server branch', {
      'apps/hub/src/server.ts': 'import "./identity-access/sessions.js"',
      'apps/hub/src/identity-access/sessions.ts': '',
    }],
    ['IMPORT_LAYER_MATRIX http branch', {
      'apps/hub/src/http/app.ts': 'import "../platform/db.js"',
      'apps/hub/src/platform/db.ts': '',
    }],
    ['IMPORT_LAYER_MATRIX workspace routes branch', {
      'apps/hub/src/workspace/routes.ts': 'import "../platform/db.js"',
      'apps/hub/src/platform/db.ts': '',
    }],
    ['IMPORT_LAYER_MATRIX workspace store branch', {
      'apps/hub/src/workspace/store.ts': 'import "../http/problem.js"',
      'apps/hub/src/http/problem.ts': '',
    }],
    ['IMPORT_LAYER_MATRIX platform branch', {
      'apps/hub/src/platform/db.ts': 'import "../http/problem.js"',
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

function layerViolations(files) {
  const root = fixture(files)
  try {
    return checkImportLaw(root).filter((item) => item.id === 'IMPORT_LAYER_MATRIX').map((item) => `${item.source} -> ${item.specifier}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('the access edges: HTTP reads the session contract, the token and the lifetimes; routes read access and cookies', () => {
  assert.deepEqual(layerViolations({
    'apps/hub/src/http/access.ts': 'import type { HubSession } from "../identity-access/public.js"; import "../platform/opaque-token.js"; import "../platform/lifetimes.js"',
    'apps/hub/src/identity-access/public.ts': '',
    'apps/hub/src/platform/opaque-token.ts': '',
    'apps/hub/src/platform/lifetimes.ts': '',
    'apps/hub/src/workspace/routes.ts': 'import "../http/access.js"; import "../http/cookies.js"',
    'apps/hub/src/http/cookies.ts': '',
  }), [])
  assert.deepEqual(layerViolations({
    'apps/hub/src/http/app.ts': 'import "../hosting/module.js"; import "../platform/application-csp.js"',
    'apps/hub/src/http/access.ts': 'import "../identity-access/sessions.js"',
    'apps/hub/src/hub.ts': 'import "./http/access.js"',
    'apps/hub/src/workspace/routes.ts': 'import "../platform/origin.js"',
    'apps/hub/src/hosting/module.ts': '',
    'apps/hub/src/platform/application-csp.ts': '',
    'apps/hub/src/identity-access/sessions.ts': '',
    'apps/hub/src/platform/origin.ts': '',
  }).sort(), [
    'apps/hub/src/http/access.ts -> ../identity-access/sessions.js',
    'apps/hub/src/http/app.ts -> ../hosting/module.js',
    'apps/hub/src/http/app.ts -> ../platform/application-csp.js',
    'apps/hub/src/hub.ts -> ./http/access.js',
    'apps/hub/src/workspace/routes.ts -> ../platform/origin.js',
  ])
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

test('Hub and the three Builder consumers reach the public model-account entry', () => {
  const root = fixture({
    'apps/hub/src/hub.ts': 'import "./model-account/module.js"',
    'apps/hub/src/builder/module.ts': 'import "../model-account/module.js"',
    'apps/hub/src/builder/model-routing.ts': 'import "../model-account/module.js"',
    'apps/hub/src/builder/harness/request-context.ts': 'import "../../model-account/module.js"',
    'apps/hub/src/model-account/module.ts': '',
  })
  try { assert.deepEqual(checkImportLaw(root), []) } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the new owner registration refuses deep imports, unregistered consumers and cycles', () => {
  assertRule('IMPORT_OWNER_TO_OWNER', {
    'apps/hub/src/builder/module.ts': 'import "../model-account/credential.js"',
    'apps/hub/src/model-account/credential.ts': '',
  })
  assertRule('IMPORT_OWNER_TO_OWNER', {
    'apps/hub/src/connectors/module.ts': 'import "../model-account/module.js"',
    'apps/hub/src/model-account/module.ts': '',
  })
  assertRule('IMPORT_CYCLE', {
    'apps/hub/src/builder/module.ts': 'import "../model-account/module.js"',
    'apps/hub/src/model-account/module.ts': 'import "../builder/module.js"',
  })
})

test('declared owners expose only public interfaces to declared consumers, including types', () => {
  const root = fixture({
    'apps/hub/src/builder/application.ts': 'import type { SealedApplication } from "../registry/public.js"',
    'apps/hub/src/registry/public.ts': 'export type { SealedApplication } from "./seal.js"',
    'apps/hub/src/registry/seal.ts': 'export type SealedApplication = string',
  })
  try { assert.deepEqual(checkImportLaw(root), []) } finally { rmSync(root, { recursive: true, force: true }) }
  assertRule('IMPORT_OWNER_TO_OWNER', {
    'apps/hub/src/builder/application.ts': 'import type { SealedApplication } from "../registry/seal.js"',
    'apps/hub/src/registry/seal.ts': '',
  })
  assertRule('IMPORT_OWNER_TO_OWNER', {
    'apps/hub/src/connectors/module.ts': 'import type { SealedApplication } from "../registry/public.js"',
    'apps/hub/src/registry/public.ts': '',
  })
  assertRule('IMPORT_CENSUS', { 'apps/hub/src/unregistered/module.ts': '' })
})

test('HTTP consumes only public session types and technical token hashing', () => {
  const entry = 'apps/hub/src/identity-access/public.ts'
  const cases = [
    ['import { admitProject } from "../identity-access/public.js"', false],
    ['import type { Admitted } from "../identity-access/public.js"', false],
    ['import iam, { type HubSession } from "../identity-access/public.js"', false],
    ['import * as iam from "../identity-access/public.js"', false],
    ['export * from "../identity-access/public.js"', false],
    ['import "../identity-access/public.js"', false],
    ['const iam = require("../identity-access/public.js")', false],
    ['import type { CurrentSession, HubSessionDigest } from "../identity-access/public.js"', true],
    ['import { type HubSession } from "../identity-access/public.js"', true],
  ]
  for (const [source, allowed] of cases) {
    const found = layerViolations({ 'apps/hub/src/http/access.ts': source, [entry]: '' })
    assert.deepEqual(found, allowed ? [] : ['apps/hub/src/http/access.ts -> ../identity-access/public.js'], source)
  }
  assert.deepEqual(layerViolations({
    'apps/hub/src/http/access.ts': 'import { digest } from "../platform/db.js"',
    'apps/hub/src/platform/db.ts': '',
  }), [])
  assertRule('IMPORT_LAYER_MATRIX', {
    'apps/hub/src/http/access.ts': 'import { digest, openDatabase } from "../platform/db.js"',
    'apps/hub/src/platform/db.ts': '',
  })
})
