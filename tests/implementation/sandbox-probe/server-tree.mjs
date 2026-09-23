import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The reviewed arena cases as one admitted server tree: each case is an operation whose answer is
// the case's own report, serialized, so the manifest's exact output schema stays one string.
const CASES = ['read_secrets', 'walk_fs', 'read_proc', 'network_egress']
const ADAPTER = `${CASES.map((name) => `import ${name} from '../cases/${name}.mjs'`).join('\n')}
const report = (run) => async (input) => ({ text: JSON.stringify(await run(input)) })
${CASES.map((name) => `export const ${name}_case = report(${name})`).join('\n')}
`
const text = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }
const INPUTS = {
  read_secrets: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string', maxLength: 512 }, maxItems: 64 } }, required: ['paths'], additionalProperties: false },
  walk_fs: { type: 'object', properties: { home: { type: 'string', maxLength: 512 } }, required: ['home'], additionalProperties: false },
  read_proc: { type: 'object', properties: {}, additionalProperties: false },
  network_egress: {
    type: 'object',
    properties: { targets: { type: 'array', maxItems: 16, items: { type: 'object', properties: { host: { type: 'string', maxLength: 64 }, port: { type: 'integer', minimum: 1, maximum: 65535 } }, required: ['host', 'port'], additionalProperties: false } } },
    required: ['targets'],
    additionalProperties: false,
  },
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const file = (path, bytes) => ({ path: `conexus-server/${path}`, sha256: sha(bytes), content: Buffer.from(bytes).toString('base64') })

export const probeOperations = Object.fromEntries(CASES.map((name) => [name, `${name.replace(/_(.)/g, (_, c) => c.toUpperCase())}Case`]))

export const probeServerTree = () => {
  const manifest = {
    version: 1,
    operations: Object.fromEntries(CASES.map((name) => [probeOperations[name], { module: 'handlers/probe.mjs', export: `${name}_case`, input: INPUTS[name], output: text }])),
    migrations: [],
  }
  return [
    file('manifest.json', JSON.stringify(manifest)),
    file('handlers/probe.mjs', ADAPTER),
    ...CASES.map((name) => file(`cases/${name}.mjs`, readFileSync(join(import.meta.dirname, `${name}.mjs`)))),
  ]
}
