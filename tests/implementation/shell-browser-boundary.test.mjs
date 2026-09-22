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
  assert.match(source, /sendFile\('index\.html'/)
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
