import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import {
  PROBLEM_TYPES,
  deleteFailureMessage,
} from '../../apps/web/src/features/project/delete-problem.ts'

test('deleteFailureMessage maps Hub problem URNs to specific Portuguese messages and falls back for unknown/bare types', async (t) => {
  const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
  const { registerProjectRoutes } = await import(hubModuleUrl('project/routes.js'))
  const { ProjectError } = await import(hubModuleUrl('project/errors.js'))

  let thrownError = null
  const app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => registerProjectRoutes(server, {
      origin: 'https://conexus.test',
      resolveCurrentSession: async () => ({ account: { accountId: 'account-415' } }),
      store: {
        deleteProject: async () => {
          if (thrownError) throw thrownError
        },
      },
    }),
  })
  t.after(() => app.close())

  const deleteRequest = (confirmName = 'wrong-name') => app.inject({
    method: 'DELETE',
    url: `/api/control/projects/30000000-0000-8000-8000-000000000415?confirmName=${encodeURIComponent(confirmName)}`,
    headers: {
      origin: 'https://conexus.test',
      cookie: '__Host-conexus_csrf=token',
      'x-conexus-csrf': 'token',
    },
  })

  // 1. Hub emits PROJECT_NAME_MISMATCH -> HTTP 409 with full URN
  thrownError = new ProjectError('PROJECT_NAME_MISMATCH')
  const mismatchResponse = await deleteRequest('wrong')
  assert.equal(mismatchResponse.statusCode, 409)
  const mismatchJson = mismatchResponse.json()
  assert.equal(mismatchJson.type, PROBLEM_TYPES.projectNameMismatch)
  assert.equal(mismatchJson.type, 'urn:conexus:problem:project-name-mismatch')
  assert.equal(
    deleteFailureMessage(mismatchResponse.statusCode, mismatchJson.type),
    'O nome digitado não corresponde ao Projeto. Confira e digite exatamente como aparece.',
  )

  // 2. Hub emits PROJECT_BUSY -> HTTP 409 with full URN
  thrownError = new ProjectError('PROJECT_BUSY')
  const busyResponse = await deleteRequest('My Project')
  assert.equal(busyResponse.statusCode, 409)
  const busyJson = busyResponse.json()
  assert.equal(busyJson.type, PROBLEM_TYPES.projectBusy)
  assert.equal(busyJson.type, 'urn:conexus:problem:project-busy')
  assert.equal(
    deleteFailureMessage(busyResponse.statusCode, busyJson.type),
    'O Projeto está processando uma tarefa agora. Espere terminar e tente de novo.',
  )

  // 3. Negative tests: bare slug, prefix alteration, unknown URN fall back to generic
  const genericMessage = 'O servidor não respondeu desta vez. Nada foi excluído.'
  assert.equal(deleteFailureMessage(409, 'project-name-mismatch'), genericMessage)
  assert.equal(deleteFailureMessage(409, 'project-busy'), genericMessage)
  assert.equal(deleteFailureMessage(409, 'urn:conexus:problem:project-name-mismatch-extra'), genericMessage)
  assert.equal(deleteFailureMessage(409, 'urn:conexus:problem:unknown-type'), genericMessage)
  assert.equal(deleteFailureMessage(409, null), genericMessage)
  assert.equal(deleteFailureMessage(500, null), genericMessage)

  // 4. Status-keyed errors remain untouched
  assert.equal(deleteFailureMessage(403, null), 'Só administradores da instalação podem excluir Projetos.')
  assert.equal(deleteFailureMessage(404, null), 'Este Projeto já não existe.')
  assert.equal(
    deleteFailureMessage(503, null),
    'A exclusão não terminou. O que já foi apagado não volta atrás; tente de novo para concluir.',
  )
})
