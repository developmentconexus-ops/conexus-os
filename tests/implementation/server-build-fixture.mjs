import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { hubModuleUrl } from './hub-build.mjs'

export const { SUPPORTED_NODE_IMPORTS } = await import(hubModuleUrl('app-runner/server-manifest.js'))

// The same script the Conexus build and the Project check run in the build sandbox, pointed at this
// repository's vite instead of the template's copy of the same version.
const { serverBuildScriptSource } = await import(hubModuleUrl('builder/application-server-build.js'))
const repositoryVite = resolve(import.meta.dirname, '../../node_modules/vite/dist/node/index.js')
const script = serverBuildScriptSource().replace("'/opt/conexus/compiler/node_modules/vite/dist/node/index.js'", JSON.stringify(repositoryVite))

/** Writes `files` into a fresh Project root and runs the server build on it, as the Project check does. */
export const buildServerProject = (t, files) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-server-build-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content))
  }
  writeFileSync(join(root, '.server-build.mjs'), script)
  const out = join(root, 'dist')
  const ran = spawnSync(process.execPath, [join(root, '.server-build.mjs'), root, out], { encoding: 'utf8', timeout: 60_000 })
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
