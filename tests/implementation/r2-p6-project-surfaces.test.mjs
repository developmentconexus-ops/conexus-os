import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('P6-D Project Brain keeps meaning primary and adoption explicitly conditional', () => {
  const source = read('apps/web/src/features/project-resources/components/project-brain.tsx')
  assert.match(source, /getProjectBrainContext\(projectId\)/)
  assert.match(source, /listBrainRevisions\(workspaceId, projectId\)/)
  assert.match(source, /confirmedBinding = binding\.isSuccess \? binding\.data : undefined/)
  assert.match(source, /confirmedBinding\?\.response\.headers\.get\('etag'\)/)
  assert.match(source, /\{context\.isSuccess &&/)
  assert.match(source, /\{ state: 'PRESENT', etag: bindingEtag \}/)
  assert.match(source, /\{ state: 'ABSENT' \}/)
  assert.match(source, /clearProjectBrainBinding\(projectId, etag\)/)
  assert.match(source, /Esta resposta não comprova que o vínculo esteja ausente/)
  assert.match(source, /não adotada automaticamente/)
  assert.match(source, /role="dialog"/)
  assert.match(source, /surface-overlay connection-overlay/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /revisionTrigger\.current\?\.focus\(\)/)
  assert.doesNotMatch(source, /onMutate/)
})

test('P6-D Project Integrations presents current use before choices and reuses private lifecycle', () => {
  const source = read('apps/web/src/features/project-resources/components/project-integrations.tsx')
  assert.ok(source.indexOf('listProjectConnectionBindings') < source.indexOf("listConnections('WORKSPACE'"))
  assert.match(source, /listConnections\('WORKSPACE', workspaceId, projectId\)/)
  assert.match(source, /listConnections\('PROJECT', projectId, projectId\)/)
  assert.match(source, /expectedCurrent: current/)
  assert.match(source, /expectedConnectionRevisionId: binding\.connectionRevisionId/)
  assert.match(source, /<ConnectionsSurface ownerScopeKind="PROJECT" ownerId=\{projectId\}/)
  assert.match(source, /Connection permanece inalterada/)
  assert.match(source, /detailTrigger\.current\?\.focus\(\)/)
  assert.match(source, /choiceTrigger\.current\?\.focus\(\)/)
  assert.match(source, /surface-overlay connection-overlay/)
  assert.match(source, /confirmedBindings = bindings\.isSuccess \? bindings\.data\.data : undefined/)
  assert.doesNotMatch(source, /onMutate/)
})

test('P6-D adds exactly its two routes and both load account, Project and Workspace truth', () => {
  const routes = [
    read('apps/web/src/routes/project-brain.tsx'),
    read('apps/web/src/routes/project-integrations.tsx'),
  ]
  assert.deepEqual(routes.map((source) => source.match(/path: '([^']+)'/)?.[1]), [
    '/projects/$projectId/brain',
    '/projects/$projectId/integrations',
  ])
  for (const source of routes) {
    assert.match(source, /queryFn: getAccessContext/)
    assert.match(source, /getProject\(projectId\)/)
    assert.match(source, /getWorkspace\(workspaceId \?\? ''\)/)
    assert.match(source, /Isso não confirma ausência/)
  }
})

test('P6-D routes are wired into the existing Project shell without creating another shell', () => {
  const router = read('apps/web/src/app/router.tsx')
  const shell = read('apps/web/src/app/shell.tsx')
  assert.match(router, /projectBrainRoute/)
  assert.match(router, /projectIntegrationsRoute/)
  assert.match(shell, /to="\/projects\/\$projectId\/brain"/)
  assert.match(shell, /to="\/projects\/\$projectId\/integrations"/)
  const hub = read('apps/hub/src/http/app.ts')
  assert.match(hub, /'\/projects\/:projectId\/brain'/)
  assert.match(hub, /'\/projects\/:projectId\/integrations'/)
})
