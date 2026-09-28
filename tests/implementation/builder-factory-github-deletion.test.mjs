import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { test } from 'node:test'
import { startFakeGithub } from './builder-factory-fake-github.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { createGithubApp, GithubRequestError } = await import(built('builder/factory-github.js'))

const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' })

const harness = async (t) => {
  const github = await startFakeGithub()
  t.after(() => github.close())
  const app = createGithubApp({ appId: '5015512', privateKey, baseUrl: github.baseUrl })
  const installationId = github.state.installations[0].id
  const repository = github.addRepository({ owner: 'acme-org', name: 'app' })
  return { github, app, installationId, repository }
}

test('deleteRepository removes the repository when the installation still has Administration: write', async (t) => {
  const { github, app, installationId, repository } = await harness(t)
  await app.deleteRepository(installationId, { externalId: repository.id, slug: repository.fullName })
  assert.equal(github.state.repositories.has(repository.fullName), false)
})

test('deleteRepository is idempotent: a repository already gone counts as done', async (t) => {
  const { app, installationId, repository } = await harness(t)
  await app.deleteRepository(installationId, { externalId: repository.id, slug: repository.fullName })
  await app.deleteRepository(installationId, { externalId: repository.id, slug: repository.fullName })
})

test('deleteRepository refuses when the repository at the slug is no longer the one identified by externalId', async (t) => {
  const { github, app, installationId, repository } = await harness(t)
  github.state.repositories.delete(repository.fullName)
  github.addRepository({ owner: 'acme-org', name: 'app' })
  await assert.rejects(
    app.deleteRepository(installationId, { externalId: repository.id, slug: repository.fullName }),
    /FACTORY_REPOSITORY_IDENTITY_CHANGED/,
  )
})

test('probeRepositoryAdminAccess answers true while the installation grants Administration: write', async (t) => {
  const { app, installationId, repository } = await harness(t)
  assert.equal(await app.probeRepositoryAdminAccess(installationId, repository.id), true)
})

test('probeRepositoryAdminAccess answers false, not a thrown error, when GitHub refuses the permission', async (t) => {
  const { github, app, installationId, repository } = await harness(t)
  github.denyPermission('administration')
  assert.equal(await app.probeRepositoryAdminAccess(installationId, repository.id), false)
})

test('probeRepositoryAdminAccess rethrows a failure that is not a refused permission', async (t) => {
  const { github, app, installationId, repository } = await harness(t)
  await github.close()
  await assert.rejects(app.probeRepositoryAdminAccess(installationId, repository.id), GithubRequestError)
})
