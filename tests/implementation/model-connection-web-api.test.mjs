import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const apiSource = readFileSync(resolve(repositoryRoot, 'apps/web/src/features/model-connection/api.ts'), 'utf8')
const uiSource = readFileSync(resolve(repositoryRoot, 'apps/web/src/features/model-connection/components/model-connection-settings.tsx'), 'utf8')
const contractSource = readFileSync(resolve(repositoryRoot, 'contracts/api/product/model-connection-paths.yaml'), 'utf8')

test('Model connection web surface exposes only safe metadata and opaque mutations', () => {
  for (const path of [
    '/api/control/me/model-connections',
    '/api/control/me/model-connections/authorization',
    '/api/control/me/model-connections/authorization/complete',
    '/api/control/me/model-connections/api-key',
    '/api/control/me/model-connections/select',
    '/api/control/me/model-connections/share',
    '/api/control/me/model-connections/{connectionId}/revoke',
  ]) assert.match(contractSource, new RegExp(path.replaceAll('/', '\\/').replace('{connectionId}', '\\{connectionId\\}')))
  assert.match(apiSource, /credentials: 'same-origin'/)
  assert.match(apiSource, /x-conexus-csrf/)
  assert.match(uiSource, /result: string; label: string|code#state/)
  assert.match(uiSource, /window\.open\(url, '_blank'/)
  assert.match(uiSource, /connectionId/)
})

// The word "provider" is now a legitimate field on this surface, so it can no longer stand in
// for "credential material". What must hold is narrower and is the actual risk: the key travels
// out of the browser once and is never rendered, cached or read back from a response.
test('the API key leaves the browser once and is never rendered or read back', () => {
  // Typed into a password field, held in local state, and cleared the moment it is accepted.
  assert.match(uiSource, /type="password" value=\{apiKey\}/)
  assert.match(uiSource, /onSuccess: async \(\) => \{ setApiKey\(''\)/)
  // The key is named exactly once in the client, as an input the caller supplies. There is no
  // second mention, so there is no path that reads one back out.
  // `apiKeyProviders` is the list of providers a key may be filed under, not a key.
  assert.deepEqual(apiSource.match(/\bapiKey\b/g), ['apiKey'])
  assert.match(apiSource, /addModelConnectionApiKey\(input: Readonly<\{ providerId: string; label: string; apiKey: string \}>\)/)
  // Nothing reads a credential off a response: the projection type has no field for one.
  assert.doesNotMatch(apiSource, /type ModelConnection = Readonly<\{[^}]*(apiKey|token|secret)/s)
  // The key is bound to the password input and passed to the mutation, and appears nowhere else:
  // never as a JSX text node, never in a title, label or message.
  assert.deepEqual(uiSource.match(/\{apiKey\}|\bapiKey\b/g)?.filter((match) => match === '{apiKey}'), ['{apiKey}'])
  assert.doesNotMatch(uiSource, />\s*\{apiKey\}\s*</)
})
