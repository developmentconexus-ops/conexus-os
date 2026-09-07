import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const read = (relative) => readFileSync(resolve(repositoryRoot, relative), 'utf8')

test('R2-P6 Workspace routes realize only the locked Brain and Connections destinations', () => {
  const router = read('apps/web/src/app/router.tsx')
  const shell = read('apps/web/src/app/shell.tsx')
  const brainRoute = read('apps/web/src/routes/workspace-brain.tsx')
  const connectionsRoute = read('apps/web/src/routes/workspace-connections.tsx')

  assert.match(router, /workspaceBrainRoute/)
  assert.match(router, /workspaceConnectionsRoute/)
  assert.match(brainRoute, /path: '\/workspaces\/\$workspaceId\/brain'/)
  assert.match(connectionsRoute, /path: '\/workspaces\/\$workspaceId\/connections'/)
  assert.match(shell, /to="\/workspaces\/\$workspaceId\/brain"/)
  assert.match(shell, /to="\/workspaces\/\$workspaceId\/connections"/)
  const hub = read('apps/hub/src/http/app.ts')
  assert.match(hub, /'\/workspaces\/:workspaceId\/brain'/)
  assert.match(hub, /'\/workspaces\/:workspaceId\/connections'/)
})

test('R2-P6 Workspace Brain is Knowledge-first and keeps revisions and health separate', () => {
  const source = read('apps/web/src/features/brain/components/workspace-brain.tsx')

  assert.match(source, /\['KNOWLEDGE', 'Knowledge'\]/)
  assert.match(source, /\['REVISIONS', 'Revisões'\]/)
  assert.match(source, /\['HEALTH', 'Saúde'\]/)
  assert.match(source, /knowledgeBrowse\.domains/)
  assert.match(source, /healthLabels/)
  assert.match(source, /Não altera o conteúdo|não altera o conteúdo/)
  assert.doesNotMatch(source, /BRN-0[4-9]|discovery|proposal/i)
  assert.doesNotMatch(source, /reviewText\.split|marked\(|parseMarkdown|innerHTML/)
})

test('R2-P6 Connections preserves collection context and exact five-state server truth', () => {
  const source = read('apps/web/src/features/connections/components/connections-surface.tsx')
  const styles = read('apps/web/src/styles.css')

  for (const state of ['NOT_TESTED', 'NEEDS_RETEST', 'PASSED', 'FAILED', 'INDETERMINATE']) {
    assert.match(source, new RegExp(state))
  }
  assert.match(source, /export function ConnectionsSurface/)
  assert.match(source, /ownerScopeKind: ConnectionOwnerScope/)
  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /queueMicrotask\(\(\) => selectedTrigger\.current\?\.focus\(\)\)/)
  assert.match(source, /selectedTrigger\.current = createTrigger\.current/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /connection-panel/)
  assert.match(styles, /@media \(max-width: 48rem\)/)
  assert.match(styles, /\.connection-panel \{ width: 100%; \}/)
})

test('R2-P6 Connection writes stay explicit, non-optimistic and credential input is write-only', () => {
  const source = read('apps/web/src/features/connections/components/connections-surface.tsx')

  for (const operation of ['createConnection', 'reviseConnection', 'setConnectionCredential', 'qualifyConnection']) {
    assert.match(source, new RegExp(`${operation}\\(`))
  }
  for (const guard of ['submitInFlight', 'reviseInFlight', 'credentialInFlight', 'qualifyInFlight']) {
    assert.match(source, new RegExp(guard))
  }
  assert.match(source, /expectedCurrentRevisionId: detail\.currentRevisionId/)
  assert.match(source, /connectionRevisionId: detail\.currentRevisionId/)
  assert.match(source, /type="password"/)
  assert.match(source, /setClientId\(''\)/)
  assert.match(source, /setClientSecret\(''\)/)
  assert.match(source, /setXToken\(''\)/)
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|credentialGeneration/)
  assert.doesNotMatch(source, /onMutate|setQueryData\([^)]*connectionQueryKey/)
})
