import { hubModuleUrl } from './hub-build.mjs'

const input = JSON.parse(process.env.CRASH_INPUT)
const { openDatabase } = await import(hubModuleUrl('platform/db.js'))
const { createRegistryModule } = await import(hubModuleUrl('registry/module.js'))
const { createBuilderStore } = await import(hubModuleUrl('builder/store.js'))

const database = openDatabase({ ...input.connection, user: 'hub_runtime', passwordFile: input.passwordFile, max: 2 })
const registry = createRegistryModule({ database })
const dying = { ...registry, retain: async (proof, sealed) => {
  await registry.retain(proof, sealed)
  process.kill(process.pid, 'SIGKILL')
} }
const store = createBuilderStore({ database, ownerId: input.ownerId, registry: dying })
const bytes = Buffer.from('<html></html>')
const sealed = registry.seal({
  compiledApplication: { ...input.build, files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8', bytes, sha256: input.fileSha256 }] },
  thumbnail: { bytes: Uint8Array.from(input.thumbnail) },
}, { projectId: input.build.projectId, builderRunId: input.build.executionId, sourceRevision: input.build.sourceRevision })
await store.settleBuilderRunBuild({ builderRunId: input.build.executionId, kind: 'BUILT', sealed })
