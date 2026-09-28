import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { createFactorySecretEncryption as packaged } from '@mastra/factory/secret-encryption'
import { hubModuleUrl } from './hub-build.mjs'

// The one place in the Hub still allowed to import @mastra/factory, so this file is what slice 7
// deletes along with the package. It proves the copy at platform/factory-secret-encryption.ts
// interoperates with the packaged module both ways, under the same prefix
// (mastra:factory-secret:v1:) five database CHECK constraints require (spec 0002, Security
// model), before platform/secrets.ts is trusted to seal every Conexus secret with the copy alone.
const built = hubModuleUrl
const { createFactorySecretEncryption: copy } = await import(built('platform/factory-secret-encryption.js'))
const { createSecretEnvelope } = await import(built('platform/secrets.js'))

const randomHexKey = () => randomBytes(32).toString('hex')
const keyOf = (hexKey) => ({ id: createHash('sha256').update(Buffer.from(hexKey, 'hex')).digest('hex').slice(0, 16), key: Buffer.from(hexKey, 'hex') })
const PREFIX = 'mastra:factory-secret:v1:'

test('the copy and the packaged module open each other\'s sealed values, and the Hub envelope opens both', async () => {
  const hexKey = randomHexKey()
  const key = keyOf(hexKey)
  const a = packaged({ primary: key })
  const b = copy({ primary: key })

  const sealedByPackage = await a.encrypt('segredo')
  assert.equal(sealedByPackage.startsWith(PREFIX), true)
  assert.equal((await b.decrypt(sealedByPackage)).value, 'segredo')

  const sealedByCopy = await b.encrypt('segredo')
  assert.equal(sealedByCopy.startsWith(PREFIX), true)
  assert.equal((await a.decrypt(sealedByCopy)).value, 'segredo')

  const hub = createSecretEnvelope(hexKey)
  assert.equal(await hub.open(sealedByPackage), 'segredo')
  assert.equal(await hub.open(sealedByCopy), 'segredo')

  const sealedByHub = await hub.seal('segredo')
  assert.equal(sealedByHub.startsWith(PREFIX), true)
  assert.equal((await a.decrypt(sealedByHub)).value, 'segredo')
})

test('a value under a different key id is refused, by the copy and by the package alike', async () => {
  const key = keyOf(randomHexKey())
  const otherKey = keyOf(randomHexKey())
  const a = packaged({ primary: key })
  const b = copy({ primary: otherKey })
  await assert.rejects(b.decrypt(await a.encrypt('segredo')), /Unknown key id/)
})
