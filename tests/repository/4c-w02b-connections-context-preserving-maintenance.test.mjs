import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

const htmlPath = 'docs/evidence/4c/w02b-connections-functional-wireframe.html'

test('W-02B keeps routine Connection maintenance in a contextual panel instead of replacing the collection', () => {
  const html = read(htmlPath)

  for (const token of [
    'id="connectionPanel"',
    'class="connection-panel"',
    'data-panel-context="connection"',
    'id="closeConnectionPanel"',
    'function openConnectionPanel',
    'function closeConnectionPanel',
    'function renderConnectionPanel',
  ]) requireText(html, token, `W-02B context-preserving maintenance missing: ${token}`)

  if (html.includes("showView('detail')")) {
    throw new Error('W-02B must not replace the Connections collection with a separate detail view for routine maintenance')
  }
  if (html.includes('id="backToConnections"')) {
    throw new Error('W-02B must not require Back to Connections after opening a routine Connection maintenance context')
  }
})

test('W-02B edits configuration and credentials inline while keeping test and remediation in the same Connection panel', () => {
  const html = read(htmlPath)

  for (const token of [
    'id="configurationRead"',
    'id="configurationEditor"',
    'id="cancelConfigurationEdit"',
    'function toggleConfigurationEdit',
    'id="credentialRead"',
    'id="credentialEditor"',
    'id="cancelCredentialEdit"',
    'function toggleCredentialEdit',
    'Connection updated. Test again',
    'Credentials updated. Test again',
    'Connection test',
    'Test connection',
    'View problem',
    'markTestNeedsRetest',
  ]) requireText(html, token, `W-02B inline maintenance missing same-context behavior: ${token}`)
})
