import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const read = (relative) => readFileSync(resolve(repositoryRoot, relative), 'utf8')

test('S5-P0 serves every realized browser route through the same-origin SPA host', () => {
  const source = read('apps/hub/src/http/app.ts')
  for (const route of [
    '/workspaces/new',
    '/workspaces/:workspaceId/projects',
    '/workspaces/:workspaceId/projects/new',
    '/projects/:projectId',
    '/projects/:projectId/inception',
    '/projects/:projectId/baseline-candidates/:candidateBaselineDigest',
  ]) {
    assert.match(source, new RegExp(route.replaceAll('/', '\\/').replaceAll(':', '\\:')))
  }
  assert.match(source, /sendFile\('index\.html'/)
})

test('S6 Inception survives a direct same-origin cold refresh', () => {
  const hub = read('apps/hub/src/http/app.ts')
  const route = read('apps/web/src/routes/project-inception.tsx')
  assert.match(route, /path: '\/projects\/\$projectId\/inception'/)
  assert.match(hub, /'\/projects\/:projectId\/inception'/)
})

test('S5-P0 realizes one adaptive server-oriented shell and recoverable focus', () => {
  const shell = read('apps/web/src/app/shell.tsx')
  const styles = read('apps/web/src/styles.css')
  assert.match(shell, /aria-label="Navegação principal"/)
  assert.match(shell, /aria-label="Contexto atual"/)
  assert.match(shell, /aria-controls="primary-navigation"/)
  assert.match(shell, /accountTrigger\.current\?\.focus\(\)/)
  assert.match(shell, /navigationTrigger\.current\?\.focus\(\)/)
  assert.match(shell, /pointerdown/)
  assert.match(styles, /\.shell-body/)
  assert.match(styles, /\.navigation-drawer/)
  assert.match(styles, /@media \(max-width: 48rem\)/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
})

test('S5-P0 preserves the four-state/no-client-authority boundary', () => {
  const sources = [
    'apps/web/src/app/query-client.tsx',
    'apps/web/src/app/shell.tsx',
    'apps/web/src/routes/index.tsx',
    'apps/web/src/routes/setup.tsx',
    'apps/web/src/features/workspace/components/workspace-create-form.tsx',
    'apps/web/src/features/project/components/project-create-form.tsx',
    'apps/web/src/features/project/components/baseline-candidate.tsx',
  ].map(read).join('\n')
  assert.doesNotMatch(sources, /localStorage|sessionStorage|indexedDB/)
  assert.doesNotMatch(sources, /isAuthorized|hasPermission|canApprove|role(s)?\s*===/i)
  assert.match(sources, /clearAuthorityCache\(\)/)
  assert.match(sources, /disabled=\{[^}]*isPending/)
})

test('S5-P0 guards every realized browser command against synchronous double activation', () => {
  const guarded = [
    ['apps/web/src/app/shell.tsx', /signOutInFlight/],
    ['apps/web/src/routes/setup.tsx', /provisionInFlight/],
    ['apps/web/src/features/workspace/components/workspace-create-form.tsx', /createInFlight/],
    ['apps/web/src/features/project/components/project-create-form.tsx', /createInFlight/],
    ['apps/web/src/features/project/components/baseline-candidate.tsx', /approvalInFlight/],
  ]
  for (const [file, guard] of guarded) {
    const source = read(file)
    assert.match(source, guard, file)
    assert.match(source, /\.current\) return/, file)
    assert.match(source, /onSettled/, file)
  }
})

test('S5-P1 pins every admitted browser in an isolated read-only qualification process', () => {
  const packageJson = JSON.parse(read('package.json'))
  const command = packageJson.scripts['r1:s5:p1:browser']
  assert.equal(typeof command, 'string')
  for (const browser of ['chromium', 'firefox', 'webkit']) {
    assert.match(command, new RegExp(`CONEXUS_S5_BROWSER=${browser}`))
  }
  assert.match(command, /conexus-r1-s5-playwright:1\.62\.1-node24\.20\.0/)
  assert.match(command, /playwright-node24\.Dockerfile/)
  assert.match(command, /\$PWD:\/work\/repo:ro/)
  assert.equal(command.match(/docker run --rm/g)?.length, 3)
})
