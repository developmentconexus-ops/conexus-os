import assert from 'node:assert/strict'
import test from 'node:test'
import { THINKING_LEVEL_VALUES } from '@mastra/code-sdk/thinking'
import { THINKING_LEVELS, ThinkingLevel } from '../../packages/contract/dist/index.js'

test('the contract lists exactly the thinking levels of Mastra Code, lowest first', () => {
  assert.deepEqual([...THINKING_LEVELS], ['off', 'low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual([...THINKING_LEVELS], THINKING_LEVEL_VALUES)
})

test('the contract refuses a level Mastra Code does not list', () => {
  assert.equal(ThinkingLevel.safeParse('ultra').success, false)
  assert.equal(ThinkingLevel.safeParse('xhigh').success, true)
})
