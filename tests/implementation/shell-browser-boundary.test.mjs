import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const read = (relative) => readFileSync(resolve(repositoryRoot, relative), 'utf8')

test('the SPA page carries its own style nonce, the same one its CSP allows, fresh per response', async (t) => {
  const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
  const staticRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/shell-static-'))
  t.after(() => rmSync(staticRoot, { recursive: true, force: true }))
  writeFileSync(resolve(staticRoot, 'index.html'), '<!doctype html><html><head><title>Conexus</title></head><body></body></html>')
  const app = await createHttpApp({ staticRoot, registerRoutes: async () => [] })
  t.after(() => app.close())

  const nonces = []
  for (let i = 0; i < 2; i += 1) {
    const response = await app.inject({ method: 'GET', url: '/settings/models' })
    assert.equal(response.statusCode, 200)
    const page = response.body.match(/<meta name="csp-nonce" content="([0-9a-f]{32})">/)?.[1]
    assert.ok(page, response.body)
    const styleSrc = response.headers['content-security-policy'].split(';').find((d) => d.trim().startsWith('style-src '))
    assert.ok(styleSrc.includes(`'nonce-${page}'`), styleSrc)
    assert.ok(!styleSrc.includes("'unsafe-inline'"), styleSrc)
    nonces.push(page)
  }
  assert.notEqual(nonces[0], nonces[1])
})

test('S5-P0 serves every realized browser route through the same-origin SPA host', () => {
  const source = read('apps/hub/src/http/app.ts')
  for (const route of [
    '/workspaces/new',
    '/workspaces/:workspaceId/projects',
    '/workspaces/:workspaceId/projects/new',
    '/projects/:projectId',
    '/projects/:projectId/build',
    '/projects/:projectId/c/:conversationId',
    '/workspaces',
    '/signed-out',
    '/no-access',
    '/workspaces/:workspaceId/settings/people',
    '/projects/:projectId/settings',
    '/settings/account',
    '/settings/models',
    '/settings/installation/github',
    '/settings/installation/models',
    '/settings/installation/model-defaults',
    '/settings/installation/memory',
    '/settings/installation/admins',
  ]) {
    assert.match(source, new RegExp(route.replaceAll('/', '\\/').replaceAll(':', '\\:')))
  }
  assert.match(source, /readFileSync\(join\(staticRoot, 'index\.html'\)/)
})

test('S5-P0 realizes one adaptive server-oriented shell and recoverable focus', () => {
  const shell = read('apps/web/src/app/shell.tsx')
  const styles = read('apps/web/src/styles.css')
  // The frame, the sidebar, its narrow-screen drawer and the menus (which own their focus return)
  // are the component library's; the shell supplies the labels. project-browser drives them.
  assert.match(shell, /<MainSidebarProvider /)
  assert.match(shell, /<MainSidebar\.Nav aria-label="Navegação principal">/)
  assert.match(shell, /<MainSidebar\.MobileTrigger aria-label="Abrir navegação"/)
  assert.match(shell, /<Breadcrumb label="Contexto atual"/)
  assert.match(shell, /<AppShell/)
  assert.match(shell, /<DropdownMenu>/)
  assert.match(styles, /@media \(max-width: 48rem\)/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
})

test('S5-P0 sidebar collapses to a 56px icon rail with a top toggle, ⌘B/Ctrl+B, and a phone drawer', () => {
  const shell = read('apps/web/src/app/shell.tsx')
  assert.match(shell, /collapsedWidth=\{56\}/)
  assert.match(shell, /disableKeyboardShortcut=\{false\}/)
  assert.match(shell, /mobileBreakpoint=\{768\}/)
  // The toggle sits in the header row above <MainSidebar.Nav>, never in a footer.
  const rootIndex = shell.indexOf('<MainSidebar className="shell-sidebar">')
  const triggerIndex = shell.indexOf('<MainSidebar.Trigger ')
  const navIndex = shell.indexOf('<MainSidebar.Nav aria-label="Navegação principal">')
  assert.ok(rootIndex >= 0 && triggerIndex > rootIndex && triggerIndex < navIndex, 'the collapse toggle is above the nav, at the top of the sidebar')
})

test('S5-P0 sidebar is contextual: a Configurações link at the bottom, and disabled "Em breve" capabilities inside a Project', () => {
  const shell = read('apps/web/src/app/shell.tsx')
  assert.match(shell, /<MainSidebar\.Bottom className="cx-rail-bottom">/)
  assert.match(shell, /Configurações do projeto/)
  assert.match(shell, /aria-disabled="true"/)
  assert.match(shell, /tooltipMsg: 'Em breve'/)
  for (const label of ['Dados', 'Capacidades', 'Integrações']) assert.match(shell, new RegExp(`label="${label}"`))
})

test('S5-P0 carries a remembered light/dark toggle, built on the component library\'s own ThemeProvider', () => {
  const main = read('apps/web/src/main.tsx')
  const shell = read('apps/web/src/app/shell.tsx')
  const toggle = read('apps/web/src/app/theme-toggle.tsx')
  assert.match(main, /<ThemeProvider defaultTheme="system" storageKey="conexus-theme">/)
  assert.match(shell, /<ThemeToggle \/>/)
  assert.doesNotMatch(shell, /localStorage/)
  assert.match(toggle, /from '@mastra\/playground-ui\/components\/ThemeProvider'/)
  assert.match(toggle, /useTheme\(\)/)
  assert.doesNotMatch(toggle, /localStorage/)
})

test('S5-P0 drops the floating rounded content card; the frame runs edge to edge under the top bar and sidebar', () => {
  const frame = read('apps/web/src/app/frame.css')
  assert.match(frame, /\[data-slot="app-shell-frame"\] \{ margin: 0; border: 0; border-radius: 0;/)
})

test('S5-P0 brand tokens carry the one radius scale: controls, real objects, and the composer', () => {
  const tokens = read('packages/brand/src/tokens.css')
  assert.match(tokens, /--cx-radius-control: 6px;/)
  assert.match(tokens, /--cx-radius-object: 10px;/)
  assert.match(tokens, /--cx-radius-composer: 16px;/)
})

test('S5-P0 preserves the four-state/no-client-authority boundary', () => {
  const sources = [
    'apps/web/src/app/query-client.tsx',
    'apps/web/src/app/shell.tsx',
    'apps/web/src/routes/index.tsx',
    'apps/web/src/routes/setup.tsx',
    'apps/web/src/features/workspace/components/workspace-create-form.tsx',
    'apps/web/src/features/project/components/project-create-form.tsx',
    'apps/web/src/features/project/start-project.ts',
    'apps/web/src/app/access-gate.tsx',
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
    ['apps/web/src/features/project/start-project.ts', /inFlight/],
  ]
  for (const [file, guard] of guarded) {
    const source = read(file)
    assert.match(source, guard, file)
    assert.match(source, /\.current\) return/, file)
    assert.match(source, /onSettled/, file)
  }
})
