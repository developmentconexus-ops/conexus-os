import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { placeBundle, serverCommand } from './check-bundle-vm.mjs'
import { hubModuleUrl } from './hub-build.mjs'

export const { SUPPORTED_NODE_IMPORTS } = await import(hubModuleUrl('app-runner/server-manifest.js'))

/** Writes `files` into a fresh Project root and builds its server half with the Hub's bundle, as the Project check does. */
export const buildServerProject = (t, files) => {
  const scratch = mkdtempSync(join(tmpdir(), 'conexus-server-build-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const root = join(scratch, 'repo')
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content))
  }
  const out = join(scratch, 'dist')
  const ran = serverCommand(placeBundle(join(scratch, 'opt')), root, out)
  return { root, out, status: ran.status, stdout: ran.stdout.trim(), stderr: ran.stderr.trim() }
}

/** The built `conexus-server/` tree as the Hub hands it to the runner. */
export const serverFilesOf = (out) => readdirSync(join(out, 'conexus-server'), { recursive: true }).map(String)
  .filter((path) => statSync(join(out, 'conexus-server', path)).isFile())
  .map((path) => {
    const bytes = readFileSync(join(out, 'conexus-server', path))
    return { path: `conexus-server/${path.split(sep).join('/')}`, content: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') }
  })

const numberSchema = { type: 'object', properties: { value: { type: 'number' } }, required: ['value'], additionalProperties: false }

/**
 * Two handlers sharing a library whose names the runner's path rule would refuse as chunk names:
 * a non-ASCII `cálculos` and an underscore-led `_shared`. The library imports every supported
 * built-in, so serving it shows the runner's sandbox loads each one.
 */
export const SHARED_LIBRARY_PROJECT = Object.freeze({
  'conexus/manifest.json': {
    operations: {
      doubleValue: { handler: 'handlers/double.ts', export: 'doubleValue', input: numberSchema, output: numberSchema },
      tripleValue: { handler: 'handlers/triple.ts', export: 'tripleValue', input: numberSchema, output: numberSchema },
    },
  },
  'conexus/lib/cálculos.ts': `import { round } from './_shared'\nexport const times = (value: number, factor: number): number => round(value * factor)\n`,
  'conexus/lib/_shared.ts': `${SUPPORTED_NODE_IMPORTS.map((name) => `import '${name}'\n`).join('')}export const round = (value: number): number => Math.round(value * 100) / 100\n`,
  'conexus/handlers/double.ts': `import { times } from '../lib/cálculos'\nexport async function doubleValue(input: { value: number }) { return { value: times(input.value, 2) } }\n`,
  'conexus/handlers/triple.ts': `import { times } from '../lib/cálculos'\nexport async function tripleValue(input: { value: number }) { return { value: times(input.value, 3) } }\n`,
})
