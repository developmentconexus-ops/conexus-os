import assert from 'node:assert/strict'
import test from 'node:test'
import { failureCodeText, failureText, readFailure, ReceivedFailure } from '@conexus/contract'
import { appFailures } from './error-model-client-fixture.mjs'

const response = (code, status, extra = {}, contentType = 'application/problem+json') =>
  new Response(JSON.stringify({ type: `urn:conexus:problem:${code}`, title: code, status, code, ...extra }), {
    status,
    headers: { 'content-type': contentType },
  })

test('browser reader keeps the table identity, ignores private fields, and displays only a short SYSTEM trace', async () => {
  const traceId = '0123456789abcdef0123456789abcdef'
  const error = await readFailure(response('INTERNAL_UNEXPECTED', 500, { traceId, detail: 'PRIVATE_MARKER', cause: 'PRIVATE_CAUSE' }))
  assert.ok(error instanceof ReceivedFailure)
  assert.deepEqual([error.code, error.status, error.traceId, failureText(error)], ['INTERNAL_UNEXPECTED', 500, traceId, 'O Conexus falhou de um jeito que não esperávamos. A falha foi registrada. Referência: 01234567.'])
  assert.equal(failureText(await readFailure(response('AUTHENTICATION_REQUIRED', 401))), 'Você precisa entrar para continuar. Entre na sua conta para continuar.')
  const noAudience = await readFailure(response('HUB_FATAL', 500))
  assert.equal(noAudience.code, 'HUB_FATAL')
  assert.equal(failureText(noAudience), failureText(new ReceivedFailure('INTERNAL_UNEXPECTED', 500)))
  assert.equal(failureCodeText('HUB_FATAL'), failureCodeText('INTERNAL_UNEXPECTED'))
})

test('reader rejects planted, zero, missing, mismatched, and non-Problem responses', async () => {
  const invalid = [
    response('INTERNAL_UNEXPECTED', 500, { traceId: 'PRIVATE_TRACE_MARKER' }),
    response('INTERNAL_UNEXPECTED', 500, { traceId: '0'.repeat(32) }),
    response('INTERNAL_UNEXPECTED', 500, { traceId: '0123456789abcdef0123456789abcdef' }, 'application/json'),
    new Response('not json', { status: 502, headers: { 'content-type': 'application/problem+json' } }),
    new Response(JSON.stringify({ code: 'INTERNAL_UNEXPECTED', status: 500 }), { status: 500, headers: { 'content-type': 'application/problem+json' } }),
    response('INTERNAL_UNEXPECTED', 502),
    response('UNKNOWN', 500),
  ]
  for (const raw of invalid) {
    const failure = await readFailure(raw)
    assert.deepEqual([failure.code, failure.status], ['HUB_RESPONSE_UNREADABLE', raw.status])
    assert.equal(failureText(failure), 'A resposta que chegou à tela não veio do Conexus. Tente novamente mais tarde.')
  }
})

test('standalone app emission uses the same reader and only app-audience text', async () => {
  assert.equal(appFailures.failureText(new appFailures.ReceivedFailure('NOT_GRANTED', 403)), 'Este app perdeu o acesso ao sistema da empresa. Quem administra o Workspace precisa vincular a Conexão outra vez. Peça a quem administra o Conexus.')
  assert.equal(appFailures.failureText(new appFailures.ReceivedFailure('AUTHENTICATION_REQUIRED', 401)), 'O Conexus falhou de um jeito que não esperávamos. A falha foi registrada.')
  assert.equal(appFailures.failureText(await appFailures.readFailure(response('HANDLER_FAILED', 500, { detail: 'PRIVATE_MARKER' }))), 'Esta operação do app falhou.')
  const traceId = 'abcdef0123456789abcdef0123456789'
  assert.equal(appFailures.failureText(await appFailures.readFailure(response('APPLICATION_RUNNER_UNAVAILABLE', 503, { traceId }))), 'O Conexus não conseguiu alcançar o servidor de aplicativos. A falha foi registrada. Referência: abcdef01.')
  const noAudience = await appFailures.readFailure(response('HUB_FATAL', 500))
  assert.equal(noAudience.code, 'HUB_FATAL')
  assert.equal(appFailures.failureText(noAudience), 'O Conexus falhou de um jeito que não esperávamos. A falha foi registrada.')
  const invalid = [
    response('HANDLER_FAILED', 500, { traceId: 'PRIVATE_TRACE_MARKER' }),
    response('HANDLER_FAILED', 500, { traceId: '0'.repeat(32) }),
    response('HANDLER_FAILED', 500, {}, 'application/json'),
    new Response('not json', { status: 502, headers: { 'content-type': 'application/problem+json' } }),
    response('HANDLER_FAILED', 502),
    response('UNKNOWN', 500),
  ]
  for (const raw of invalid) {
    const failure = await appFailures.readFailure(raw)
    assert.deepEqual([failure.code, failure.status], ['HUB_RESPONSE_UNREADABLE', raw.status])
    assert.equal(appFailures.failureText(failure), 'A resposta que chegou à tela não veio do Conexus. Tente novamente mais tarde.')
  }
})
