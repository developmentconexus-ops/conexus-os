import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { conversationIdOf, runOf } from '../implementation/builder-browser-fixtures.mjs'

const implementation = resolve(import.meta.dirname, '../implementation')
const RUN = { builderRunId: '70000000-0000-4000-8000-000000000001', projectId: '70000000-0000-4000-8000-000000000002', state: 'QUEUED', phase: null, baseSourceRevision: 'a'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null }

test('a fixture run goes through the contract: a conversation id that is no UUID throws naming the field, and a named conversation id is a valid one', () => {
  assert.equal(runOf({ ...RUN, conversationId: conversationIdOf('conversation-waiting') }).state, 'QUEUED')
  assert.throws(() => runOf({ ...RUN, conversationId: 'conversation-waiting' }), (error) => error.issues[0].path.join('.') === 'conversationId')
  assert.throws(() => runOf({ ...RUN, state: 'RUNNING', phase: 'NOT_A_PHASE', conversationId: conversationIdOf('x') }), (error) => error.issues.some((issue) => issue.path.includes('phase')))
  assert.notEqual(conversationIdOf('conversation-one'), conversationIdOf('conversation-two'))
})

test('every run a Builder browser fixture builds is built by runOf, so none skips the contract', () => {
  const files = readdirSync(implementation).filter((name) => /^builder.*\.browser\.test\.mjs$|^builder-browser-fixtures\.mjs$/.test(name))
  const raw = files.flatMap((name) => readFileSync(join(implementation, name), 'utf8').split('\n').flatMap((line, index, lines) => {
    const defines = /(^\s*|[{,]\s*)builderRunId\s*[:,]/.test(line)
    const insideRunOf = [lines[index - 1] ?? '', line].some((text) => text.includes('runOf('))
    return defines && !insideRunOf ? [`${name}:${index + 1}`] : []
  }))
  assert.deepEqual(raw, [])
})
