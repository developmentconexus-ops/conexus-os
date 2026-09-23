// Builds the spike template under its own name (never the pilot's). Prints template size,
// build time and the runtime ref (templateId:buildId) needed by the other spike scripts.
import { readFileSync } from 'node:fs'
import { E2B } from 'e2b'
import { inspectSpikeTemplate, SPIKE_CPU_COUNT, SPIKE_MEMORY_MB, SPIKE_TEMPLATE_NAME } from './template.mjs'

const apiKey = readFileSync(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE ?? `${process.env.HOME}/.config/conexus/secrets/e2b-api-key`, 'utf8').trim()
const client = new E2B({ apiKey })

const start = Date.now()
const inspected = await inspectSpikeTemplate(client.Template)
if (!inspected.buildName.startsWith(`${SPIKE_TEMPLATE_NAME}:`)) throw new Error('SPIKE_TEMPLATE_NAME_MISMATCH')

const built = await client.Template.build(inspected.template, inspected.buildName, {
  cpuCount: SPIKE_CPU_COUNT,
  memoryMB: SPIKE_MEMORY_MB,
})
const buildMs = Date.now() - start

process.stdout.write(`${JSON.stringify({
  buildName: inspected.buildName,
  recipeSha256: inspected.recipeSha256,
  templateId: built.templateId,
  buildId: built.buildId,
  runtimeTemplateRef: `${built.templateId}:${built.buildId}`,
  buildMs,
}, null, 2)}\n`)
