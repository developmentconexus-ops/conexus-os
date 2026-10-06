import assert from 'node:assert/strict'
import test from 'node:test'
import { invariant } from './failure-matchers.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { readServerTree, serverFilesOf } = await import(hubModuleUrl('hosting/server-tree.js'))

// The 8 MiB a request's server tree may hold in total.
const SERVER_TREE_LIMIT_BYTES = 8 * 1024 * 1024

const PATHS = ['conexus-server/a.mjs', 'conexus-server/b.mjs', 'conexus-server/c.mjs']

const reader = (answer) => {
  const calls = []
  const read = async (path) => { calls.push(path); return answer(path) }
  return { read, calls }
}

test('a server tree over the total byte limit stops as soon as the running total crosses it, and never reaches the runner', async () => {
  const half = { kind: 'FILE', sha256: 'sha', bytes: new Uint8Array(SERVER_TREE_LIMIT_BYTES / 2 + 1) }
  const files = reader(() => half)
  const tree = await readServerTree(PATHS, files.read)
  assert.deepEqual(tree, { kind: 'TOO_LARGE' })
  assert.deepEqual(files.calls, PATHS.slice(0, 2), 'the third file is never read')
  assert.throws(() => serverFilesOf(tree), { id: 'SERVER_TREE_TOO_LARGE' })
})

test('a server tree at the limit reaches the runner as base64, in the manifest order', async () => {
  const files = reader((path) => ({ kind: 'FILE', sha256: `sha-${path}`, bytes: path === PATHS[0] ? new Uint8Array(SERVER_TREE_LIMIT_BYTES - 3) : new Uint8Array(0) }))
  const tree = await readServerTree(PATHS.slice(0, 2), files.read)
  assert.equal(tree.kind, 'TREE')
  assert.deepEqual(serverFilesOf(tree).map((file) => [file.path, file.sha256]), [[PATHS[0], `sha-${PATHS[0]}`], [PATHS[1], `sha-${PATHS[1]}`]])
  const small = await readServerTree([PATHS[0]], async () => ({ kind: 'FILE', sha256: 'sha', bytes: new TextEncoder().encode('ok') }))
  assert.deepEqual(serverFilesOf(small), [{ path: PATHS[0], sha256: 'sha', content: 'b2s=' }])
})

test('a listed file that is absent is an invariant, and a served revision that moved is the next request\'s to answer', async () => {
  for (const [answer, matcher] of [[{ kind: 'MISSING' }, invariant('APPLICATION_SERVER_FILE_MISSING')], [{ kind: 'NOT_READY' }, { id: 'APPLICATION_NOT_READY' }]]) {
    const files = reader(() => answer)
    const tree = await readServerTree(PATHS, files.read)
    assert.deepEqual(tree, answer)
    assert.deepEqual(files.calls, PATHS.slice(0, 1), 'the read stops at the first refusal')
    assert.throws(() => serverFilesOf(tree), matcher)
  }
})
