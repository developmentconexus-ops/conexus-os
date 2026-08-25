import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = path => readFileSync(resolve(root, path), 'utf8')

const hasHumanLabelField = text => /\b(?:displayName|name|label|title):(?:\s*\{[^}]*type:\s*string|\s*\n\s+type:\s*string)/m.test(text)

function between(text, start, end) {
  const i = text.indexOf(start)
  const j = text.indexOf(end, i + start.length)
  if (i < 0 || j < 0) throw new Error(`unable to isolate contract block: ${start}`)
  return text.slice(i, j)
}

test('GF-01 has human-readable Workspace and Project identity for context navigation', () => {
  const identity = read('contracts/api/product/identity-workspace-paths.yaml')
  const project = read('contracts/api/product/project-paths.yaml')

  const accessContext = between(identity, '  /api/control/access-context:', '\n  /api/control/session:')
  const getWorkspace = between(identity, '  /api/control/workspaces/{workspaceId}:', '\n  /api/control/workspaces/{workspaceId}/areas:')
  const projectSchemas = project.slice(project.indexOf('    ProjectSummary:'))

  const workspaceHasHumanLabel = hasHumanLabelField(accessContext) || hasHumanLabelField(getWorkspace)
  const projectHasHumanLabel = hasHumanLabelField(accessContext) || hasHumanLabelField(projectSchemas)

  if (!workspaceHasHumanLabel) {
    throw new Error('GF-01 cannot render a human Workspace selector/context label: current wire exposes only opaque Workspace identity')
  }
  if (!projectHasHumanLabel) {
    throw new Error('GF-01 cannot render a human Project selector/context label: current wire exposes only opaque Project identity')
  }
})
