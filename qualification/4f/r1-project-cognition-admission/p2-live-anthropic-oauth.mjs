import assert from 'node:assert/strict'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { beginNetworkEgressObservation } from './p2-egress-observer.mjs'

process.env.MASTRA_TELEMETRY_DISABLED = '1'

const observer = beginNetworkEgressObservation()
const {
  ANTHROPIC_API_ORIGIN,
  ANTHROPIC_MODEL_ID,
  ANTHROPIC_OPUS_SUCCESSOR_MODEL_ID,
  createAnthropicOAuthModel,
} = await import('./anthropic-oauth-provider.mjs')

const attempts = []
const boundaryEvents = []
let providerStatus
const receiptFlag = process.argv.indexOf('--receipt')
const receiptPath = receiptFlag >= 0 ? process.argv[receiptFlag + 1] : undefined
const modelFlag = process.argv.indexOf('--model')
const modelId = modelFlag >= 0 ? process.argv[modelFlag + 1] : ANTHROPIC_MODEL_ID

if (receiptFlag >= 0 && !receiptPath) throw new Error('R1C13_P2_RECEIPT_PATH_REQUIRED')
if (modelFlag >= 0 && !modelId) throw new Error('R1C13_P2_MODEL_REQUIRED')
if (![ANTHROPIC_MODEL_ID, ANTHROPIC_OPUS_SUCCESSOR_MODEL_ID].includes(modelId)) {
  throw new Error('PROJECT_MODEL_CATALOG_REFUSED')
}

async function writeReceipt(receipt) {
  if (!receiptPath) return
  const absolutePath = resolve(receiptPath)
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporaryPath, absolutePath)
}

const model = createAnthropicOAuthModel({
  modelId,
  maxResponseBytes: 1024 * 1024,
  observe: event => boundaryEvents.push({ type: event.type, acceptedBytes: event.acceptedBytes }),
  fetchImpl: async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    attempts.push({ origin: url.origin, path: url.pathname, redirect: init?.redirect })
    const response = await globalThis.fetch(input, init)
    providerStatus = response.status
    return response
  },
})

try {
  const result = await model.doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly READY.' }] }],
    temperature: 0,
  })
  assert.equal(attempts.length, 1)
  assert.equal(attempts[0].origin, new URL(ANTHROPIC_API_ORIGIN).origin)
  assert.equal(attempts[0].path, '/v1/messages')
  assert.equal(attempts[0].redirect, 'manual')
  assert.ok(result.content.some(part => part.type === 'text' && typeof part.text === 'string' && part.text.length > 0))
  assert.ok(boundaryEvents.some(event => event.type === 'chunk-accepted'))
  await new Promise(resolvePromise => setImmediate(resolvePromise))
  const observedEgress = observer.snapshot()
  const observedHttp = observedEgress.filter(event => event.origin)
  const observedDns = observedEgress.filter(event => event.channel === 'performance:dns')
  const observedSockets = observedEgress.filter(event => event.channel === 'performance:net')
  assert.ok(observedHttp.some(event => event.origin === 'https://api.anthropic.com' && event.path === '/v1/messages'))
  assert.ok(observedHttp.every(event => event.origin === 'https://api.anthropic.com'))
  assert.ok(observedDns.every(event => event.hostname === 'api.anthropic.com'))
  assert.ok(observedSockets.length <= observedHttp.length)
  const receipt = {
    schemaVersion: 1,
    subject: modelId === ANTHROPIC_MODEL_ID
      ? 'R1C13-P2 Anthropic personal OAuth live qualification'
      : 'R1 Project cognition Anthropic Opus 5 OAuth live successor qualification',
    status: 'PASS',
    recordedAt: new Date().toISOString(),
    provider: 'anthropic',
    modelId,
    oauth: {
      authorizeOrigin: 'https://claude.ai',
      tokenOrigin: 'https://console.anthropic.com',
      redirectOrigin: 'https://console.anthropic.com',
      scopes: ['user:profile', 'user:inference'],
      credentialMechanism: 'OAuth PKCE bearer; no API key',
    },
    attempts,
    observedHttpAttempts: observedHttp.length,
    observedDnsAttempts: observedDns.length,
    observedSocketAttempts: observedSockets.length,
    unauthorizedObservedHttpAttempts: 0,
    unauthorizedObservedNetworkAttempts: 0,
    responseObserved: true,
    responseContentDisclosed: false,
    credentialDisclosed: false,
    custody: {
      externalToRepository: true,
      regularFile: true,
      ownerOnlyFileMode: '0600',
      ownerOnlyDirectoryMode: '0700',
      tokenBytesRecorded: false,
    },
  }
  await writeReceipt(receipt)
  process.stdout.write(`${JSON.stringify(receipt)}\n`)
} catch (error) {
  const failureClass = error instanceof Error && /^PROJECT_|^ANTHROPIC_OAUTH_/.test(error.message)
    ? error.message
    : 'PROVIDER_OR_SDK_REFUSED'
  process.stderr.write(`${JSON.stringify({
    status: 'FAIL',
    modelId,
    failureClass,
    providerStatus: Number.isInteger(providerStatus) ? providerStatus : null,
    responseContentDisclosed: false,
    credentialDisclosed: false,
  })}\n`)
  process.exitCode = 1
} finally {
  observer.close()
}
