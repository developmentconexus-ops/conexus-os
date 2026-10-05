import assert from 'node:assert/strict'
import test from 'node:test'
import { graph } from '../../scripts/function-callers.mjs'

const functions = [
  { name: 'project.create_project', owner: 'project_owner', body: 'SELECT builder.register_project_repository($1)' },
  { name: 'builder.register_project_repository', owner: 'builder_owner', body: 'SELECT 1' },
]

test('an edge is recorded from a function body and from TypeScript SQL text', () => {
  const sources = [{ path: 'apps/hub/src/builder/store.ts', owner: 'apps/hub/src/builder', text: "SELECT builder.register_project_repository($1)" }]
  const { edges } = graph(functions, sources, new Set(['project.create_project', 'builder.register_project_repository']))
  assert.deepEqual(edges, [
    { callee: 'builder.register_project_repository', caller: 'project.create_project', side: 'sql' },
    { callee: 'builder.register_project_repository', caller: 'apps/hub/src/builder/store.ts', side: 'typescript' },
  ])
})

test('a call to a function a migration dropped is named', () => {
  const sources = [{ path: 'apps/hub/src/workspace/store.ts', owner: 'apps/hub/src/workspace', text: 'SELECT workspace.create_workspace($1)' }]
  const created = new Set(['project.create_project', 'builder.register_project_repository', 'workspace.create_workspace'])
  assert.deepEqual(graph(functions, sources, created).dangling, ['apps/hub/src/workspace/store.ts calls the dropped workspace.create_workspace'])
})
