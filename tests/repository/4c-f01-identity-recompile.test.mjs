import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = path => readFileSync(resolve(root, path), 'utf8')

function between(text, start, end) {
  const i = text.indexOf(start)
  const j = text.indexOf(end, i + start.length)
  if (i < 0 || j < 0) throw new Error(`unable to isolate contract block: ${start}`)
  return text.slice(i, j)
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message)
}

test('4C-F01 recompiles creation-time human identity without resurrecting generic mutation', () => {
  const identity = read('contracts/api/product/identity-workspace-paths.yaml')
  const project = read('contracts/api/product/project-paths.yaml')

  const accessContext = between(identity, '  /api/control/access-context:', '\n  /api/control/session:')
  const createWorkspace = between(identity, '  /api/control/workspaces:', '\n  /api/control/workspaces/{workspaceId}:')
  const getWorkspace = between(identity, '  /api/control/workspaces/{workspaceId}:', '\n  /api/control/workspaces/{workspaceId}/areas:')
  const projectCollection = between(project, '  /api/control/workspaces/{workspaceId}/projects:', '\n  /api/control/projects/{projectId}:')
  const duplicateProject = between(project, '  /api/control/projects/{projectId}/commands/duplicate:', '\n  /api/control/projects/{projectId}/inception-investigations:')
  const projectSchemas = project.slice(project.indexOf('    ProjectSummary:'))

  requirePattern(accessContext, /required:\s*\[workspaceId, name\]/, 'IAM-01 Workspace projection must require workspaceId + name')
  requirePattern(
    accessContext,
    /(?:required:\s*\[projectId, workspaceId, name\]|\$ref:\s*['"]?\.\/project-paths\.yaml#\/components\/schemas\/ProjectSummary['"]?)/,
    'IAM-01 Project projection must use the canonical ProjectSummary or inline projectId + workspaceId + name'
  )

  requirePattern(createWorkspace, /requestBody:[\s\S]*required:\s*\[name\]/, 'WS-01 must require creation-time name')
  requirePattern(createWorkspace, /name:\s*\n\s*type:\s*string[\s\S]*pattern:/, 'WS-01 name must be an explicit non-blank string schema')
  requirePattern(createWorkspace, /required:\s*\[workspaceId, name\]/, 'WS-01 response must return workspaceId + name')
  requirePattern(getWorkspace, /required:\s*\[workspaceId, name\]/, 'WS-02 must return workspaceId + name')

  requirePattern(projectCollection, /requestBody:[\s\S]*required:\s*\[[^\]]*\bname\b[^\]]*\]/, 'PRJ-03 must continue to require creation-time name after bounded request extension')
  requirePattern(projectCollection, /name:\s*\n\s*type:\s*string[\s\S]*pattern:/, 'PRJ-03 name must be an explicit non-blank string schema')
  requirePattern(duplicateProject, /required:\s*\[destinationWorkspaceId, name\]/, 'PRJ-06 must require destination Workspace and destination Project name')

  requirePattern(projectSchemas, /ProjectSummary:[\s\S]*required:\s*\[projectId, workspaceId, name, archived\]/, 'ProjectSummary must require human-readable name')
  requirePattern(projectSchemas, /ProjectRepresentation:[\s\S]*required:\s*\[projectId, workspaceId, name, projectRevision, archived\]/, 'ProjectRepresentation must require human-readable name')

  if (/operationId:\s*UpdateWorkspace\b/.test(identity)) throw new Error('4C-F01 must not resurrect UpdateWorkspace')
  if (/operationId:\s*UpdateProject\b/.test(project)) throw new Error('4C-F01 must not resurrect UpdateProject')
})
