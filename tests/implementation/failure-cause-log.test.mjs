import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { Failure, logFailure } = await import(hubModuleUrl('platform/failure.js'))

const recorded = () => {
  const lines = []
  const sink = (level) => (fields, message) => lines.push({ level, message, fields })
  return { lines, log: { error: sink('error'), warn: sink('warn'), info: sink('info') } }
}

test('a failure that wraps a named failure logs the code and invariant of the one it wraps', () => {
  const { lines, log } = recorded()
  const broken = new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'SERVED_POINTER_BROKEN' } })
  logFailure(log, new Failure('DATABASE_UNAVAILABLE', { cause: broken, details: { projectId: 'p' } }))
  assert.equal(lines.length, 1)
  assert.equal(lines[0].message, 'DATABASE_UNAVAILABLE')
  assert.equal(lines[0].fields['failure.details.projectId'], 'p')
  assert.equal(lines[0].fields['failure.cause.code'], 'INTERNAL_UNEXPECTED')
  assert.equal(lines[0].fields['failure.cause.invariant'], 'SERVED_POINTER_BROKEN')
})

test('a failure whose cause is not a failure adds no cause fields', () => {
  const { lines, log } = recorded()
  logFailure(log, new Failure('DATABASE_UNAVAILABLE', { cause: new Error('DATABASE_DOWN') }))
  assert.deepEqual(Object.keys(lines[0].fields).filter((key) => key.startsWith('failure.cause.')), [])
})

test('a cause whose details carry a code keeps its own id as the cause code', () => {
  const { lines, log } = recorded()
  const cause = new Failure('CONNECTOR_PLATFORM_FAILED', { details: { code: 'UPSTREAM_X', status: 502 } })
  logFailure(log, new Failure('INTERNAL_UNEXPECTED', { cause }))
  assert.equal(lines[0].fields['failure.cause.code'], 'CONNECTOR_PLATFORM_FAILED')
  assert.equal(lines[0].fields['failure.cause.status'], 502)
})
