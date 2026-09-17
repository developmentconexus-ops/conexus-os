import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const apiSource = readFileSync(resolve(repositoryRoot, 'apps/web/src/features/claude-account/api.ts'), 'utf8')
const uiSource = readFileSync(resolve(repositoryRoot, 'apps/web/src/features/claude-account/components/claude-account-settings.tsx'), 'utf8')
const contractSource = readFileSync(resolve(repositoryRoot, 'contracts/api/product/claude-account-paths.yaml'), 'utf8')

test('Claude Account web surface exposes only safe metadata and opaque mutations', () => {
  for (const path of [
    '/api/control/me/claude-connections',
    '/api/control/me/claude-connections/authorization',
    '/api/control/me/claude-connections/authorization/complete',
    '/api/control/me/claude-connections/select',
    '/api/control/me/claude-connections/share',
    '/api/control/me/claude-connections/{connectionId}/revoke',
  ]) assert.match(contractSource, new RegExp(path.replaceAll('/', '\\/').replace('{connectionId}', '\\{connectionId\\}')))
  assert.match(apiSource, /credentials: 'same-origin'/)
  assert.match(apiSource, /x-conexus-csrf/)
  assert.match(uiSource, /result: string; label: string|code#state/)
  assert.match(uiSource, /window\.open\(url, '_blank'/)
  assert.match(uiSource, /connectionId/)
  assert.doesNotMatch(uiSource, /provider|model|secret/i)
})
