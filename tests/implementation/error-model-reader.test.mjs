import assert from 'node:assert/strict'
import test from 'node:test'
import { failureText, readFailure, HubFailure } from '../../apps/web/src/app/failure.ts'
import { api, appFailures } from './error-model-client-fixture.mjs'


function response(code, status, extra = {}) {
  return new Response(JSON.stringify({ type: `urn:conexus:problem:${code}`, title: code, status, code, ...extra }), { status, headers: { 'content-type': 'application/problem+json' } })
}

test('web reader uses literal table text, action and short SYSTEM reference, ignoring private extensions', async () => {
  const traceId = '0123456789abcdef0123456789abcdef'
  const error = await readFailure(response('INTERNAL_UNEXPECTED', 500, { traceId, detail: 'PRIVATE_MARKER', cause: 'PRIVATE_CAUSE' }))
  assert.deepEqual([error.code, error.status, error.traceId, failureText(error)], ['INTERNAL_UNEXPECTED', 500, traceId, 'O Conexus falhou de um jeito que não esperávamos. A falha foi registrada. Referência: 01234567.'])
  assert.equal(failureText(await readFailure(response('AUTHENTICATION_REQUIRED', 401))), 'Você precisa entrar para continuar. Entre na sua conta para continuar.')
  assert.equal(failureText(new HubFailure('HUB_UNREACHABLE', null)), 'A tela não conseguiu falar com o Conexus agora. Tente novamente mais tarde.')
})

test('web unknown and malformed responses retain unreadable code and literal text', async () => {
  for (const body of ['not json', '{}', JSON.stringify({ type: 'urn:conexus:problem:UNKNOWN', title: 'UNKNOWN', status: 500, code: 'UNKNOWN' })]) {
    const error = await readFailure(new Response(body, { status: 502 }))
    assert.deepEqual([error.code, error.status, failureText(error)], ['HUB_RESPONSE_UNREADABLE', 502, 'A resposta que chegou à tela não veio do Conexus. Tente novamente mais tarde.'])
  }
})

test('generated client executes success and retains its current code/detail error format', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('true', { status: 200 }))
  assert.equal(await api.find({}), true)
  // U6 removes this old client's detail transport and independent fallback.
  t.mock.method(globalThis, 'fetch', async () => response('HANDLER_FAILED', 500, { detail: 'PRIVATE_MARKER' }))
  await assert.rejects(api.find({}), { code: 'HANDLER_FAILED', detail: 'PRIVATE_MARKER', message: 'HANDLER_FAILED: PRIVATE_MARKER' })
  assert.equal(appFailures.failureMessage('NOT_GRANTED'), 'Este app perdeu o acesso ao sistema da empresa. Quem administra o Workspace precisa vincular a Conexão outra vez.')
  assert.equal(appFailures.failureMessage('SYNTHETIC_UNKNOWN'), 'Não foi possível concluir a operação. A falha foi registrada.')
})
