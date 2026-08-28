import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(new URL('../../', import.meta.url).pathname)
const html = readFileSync(resolve(root, 'docs/evidence/4c/p05-project-lifecycle-and-published-app-access-functional-wireframe.html'), 'utf8')

const requireText = (needle, message = needle) => {
  if (!html.includes(needle)) throw new Error(`P-05 functional wireframe missing ${message}`)
}

test('P-05 uses one Project Manage route with task lenses', () => {
  for (const token of [
    'data-wireframe="p-05"',
    'data-lens="access"',
    'data-lens="lifecycle"',
    'App access',
    'Lifecycle',
    'People who can use the published app',
    'P-05 P8 CANDIDATE / NOT LOCKED',
  ]) requireText(token)
})

test('app access is human-operable and role consequences are exact', () => {
  for (const token of [
    'Add person',
    'Search existing Conexus accounts',
    'Only provisioned Conexus accounts can be granted access.',
    'Contact a platform operator to provision the account first.',
    'data-grant=',
    'Edit access',
    'Revoke access',
    'What can each role do?',
    'Analyze pending budgets',
    'Approve negotiated exception',
    'operationId',
    'IAM-21',
    'candidate inclusion grants nothing',
    'Keycloak identity -X-&gt; Published-App grant',
    'STALE_GRANT',
    'GRANT_DENIED',
    'CANDIDATE_NONE',
  ]) requireText(token)
})

test('lifecycle preserves exact duplicate and archive consequences', () => {
  for (const token of [
    'Duplicate Project',
    'Archive Project',
    'NO_DATA',
    'Data is not copied',
    'Credentials are not copied',
    'Bindings are not copied',
    'Archiving does not unpublish the app.',
    'Archiving does not stop automations.',
    'expectedProjectRevision',
    'ARCHIVE_STALE',
    'DESTINATION_DENIED',
  ]) requireText(token)
  if (/data-action="(?:delete|unarchive|restore)"/.test(html)) throw new Error('P-05 must not invent delete/unarchive/restore controls')
})

test('material states and accessibility mechanics are inspectable', () => {
  for (const state of ['LOADING', 'KNOWN_EMPTY', 'DENIED', 'DEPENDENCY_FAILURE', 'ARCHIVED']) {
    requireText(`<option>${state}</option>`, state)
  }
  requireText('@media(max-width:760px)')
  requireText('@media(prefers-reduced-motion:reduce)')
  requireText("event.key==='Escape'")
  requireText('aria-live="polite"')
})

test('embedded P-05 walkthrough script parses', () => {
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('P-05 functional wireframe script is absent')
  new Function(match[1])
})
