import assert from 'node:assert/strict'
import test from 'node:test'
import { failureText, HubFailure, isFailure, readFailure } from '../../apps/web/src/app/failure.ts'
import { FAILURES } from '../../packages/contract/dist/failures.generated.js'

const problem = (body, status = 409) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })

test('a problem body names its row by code and the page speaks the row, never its own words', async () => {
  const failure = await readFailure(problem({ type: 'urn:conexus:problem:PROJECT_BUSY', title: 'PROJECT_BUSY', status: 409, code: 'PROJECT_BUSY' }))
  assert.ok(failure instanceof HubFailure)
  assert.equal(failure.code, 'PROJECT_BUSY')
  assert.equal(failure.status, 409)
  assert.equal(failureText(failure), FAILURES.PROJECT_BUSY.message)
  assert.ok(isFailure(failure, 'PROJECT_BUSY'))
  assert.ok(!isFailure(failure, 'PROJECT_NOT_FOUND'))
})

test('a row with an action says what to do after the message', async () => {
  const failure = await readFailure(problem({ type: 'urn:conexus:problem:AUTHENTICATION_REQUIRED', title: 'AUTHENTICATION_REQUIRED', status: 401, code: 'AUTHENTICATION_REQUIRED' }, 401))
  assert.equal(failureText(failure), 'Você precisa entrar para continuar. Entre na sua conta para continuar.')
})

test('a body that is not a problem is the unreadable-response row', async () => {
  for (const body of ['<html>502</html>', '', '{}', '[]', '{"code":7}']) {
    const failure = await readFailure(problem(body, 502))
    assert.equal(failure.code, 'HUB_RESPONSE_UNREADABLE', body)
    assert.equal(failureText(failure), `${FAILURES.HUB_RESPONSE_UNREADABLE.message} Tente novamente mais tarde.`)
  }
})

test('an unknown problem code and anything that is not a failure read as unreadable', async () => {
  assert.equal((await readFailure(problem({ type: 'urn:conexus:problem:NOT_IN_THE_TABLE', title: 'NOT_IN_THE_TABLE', status: 500, code: 'NOT_IN_THE_TABLE' }, 500))).code, 'HUB_RESPONSE_UNREADABLE')
  assert.equal(failureText(new Error('boom')), failureText(new HubFailure('HUB_RESPONSE_UNREADABLE', null)))
})
