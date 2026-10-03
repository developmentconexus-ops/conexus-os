// Spike proof 6: does the full tree (what the gate checks) build the same app as the Preview tree
// (app/ plus the server roots, what the Preview build used to check)? Runs the Hub's real check.mjs
// on both trees with the real compiler and Chromium, and compares the collected build file by file.
// Run: node tests/spike/tree-parity.mjs
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { chromium } from '@playwright/test'
import { ensureCompilerRoot } from '../implementation/compiler-root.mjs'
import { hubModuleUrl } from '../implementation/hub-build.mjs'

const { checkScriptSource, parseCheckReport, checkSummary } = await import(hubModuleUrl('builder/application-check.js'))
const { serverBuildScriptSource } = await import(hubModuleUrl('builder/application-server-build.js'))
const { fixedApplicationStarterFiles } = await import(hubModuleUrl('builder/application-starter.js'))
const { SERVER_SOURCE_ROOTS } = await import(hubModuleUrl('builder/runtime.js'))
const compilerRoot = await ensureCompilerRoot()

const STARTER = Object.fromEntries(fixedApplicationStarterFiles().map(({ path, content }) => [path, content]))
const MANIFEST = JSON.stringify({ operations: { countNotes: {
  handler: 'handlers/notes.ts', export: 'countNotes',
  input: { type: 'object', properties: {}, required: [], additionalProperties: false },
  output: { type: 'object', properties: { total: { type: 'integer', minimum: 0 } }, required: ['total'], additionalProperties: false },
} } })
const ROOT_EXTRAS = { 'AGENTS.md': '# Projeto\n', 'MEMORY.md': '# Memória\n', '.conexus/plan.md': '# Plano\n', 'README.md': 'oi\n' }

const CASES = {
  'starter': { ...STARTER },
  'starter + root files (AGENTS.md, MEMORY.md, plan, README)': { ...STARTER, ...ROOT_EXTRAS },
  'server half (manifest + handler + migration)': { ...STARTER, ...ROOT_EXTRAS, 'conexus/manifest.json': MANIFEST,
    'conexus/handlers/notes.ts': 'export async function countNotes(): Promise<{ total: number }> {\n  return { total: 3 }\n}\n',
    'conexus/migrations/001_create_notes.sql': 'create table notes (id int);\n' },
  'handler imports conexus/lib (outside the server roots)': { ...STARTER, 'conexus/manifest.json': MANIFEST,
    'conexus/lib/total.ts': 'export const total = (): number => 3\n',
    'conexus/handlers/notes.ts': "import { total } from '../lib/total.ts'\nexport async function countNotes(): Promise<{ total: number }> {\n  return { total: total() }\n}\n" },
  'type error in conexus/ outside the server roots': { ...STARTER, 'conexus/manifest.json': MANIFEST,
    'conexus/handlers/notes.ts': 'export async function countNotes(): Promise<{ total: number }> {\n  return { total: 3 }\n}\n',
    'conexus/scratch.ts': "export const broken: number = 'x'\n" },
  'root-level config files a bundler might read (vite.config.ts, postcss.config.mjs, tsconfig.json, .env, package.json)': { ...STARTER,
    'vite.config.ts': "throw new Error('root vite config was loaded')\n",
    'postcss.config.mjs': "throw new Error('root postcss config was loaded')\n",
    'tsconfig.json': '{ "compilerOptions": { "strict": false, "noImplicitAny": false } }\n',
    '.env': 'CONEXUS_PUBLIC_FLAG=from-root-env\n',
    'package.json': '{ "type": "commonjs", "browserslist": ["ie 11"] }\n' },
}

// One root-level file at a time, to name the one that changes the build.
const ROOT_FILES = CASES['root-level config files a bundler might read (vite.config.ts, postcss.config.mjs, tsconfig.json, .env, package.json)']
for (const name of ['vite.config.ts', 'postcss.config.mjs', 'tsconfig.json', '.env', 'package.json']) CASES[`only ${name} at the root`] = { ...STARTER, [name]: ROOT_FILES[name] }
CASES['tsconfig.json at the root that changes emit (jsx: preserve, target ES5, useDefineForClassFields)'] = { ...STARTER,
  'tsconfig.json': '{ "compilerOptions": { "target": "ES5", "useDefineForClassFields": false, "jsx": "preserve", "jsxImportSource": "preact" } }\n' }
CASES['package.json at the root with only "type": "commonjs"'] = { ...STARTER, 'package.json': '{ "type": "commonjs" }\n' }
CASES['package.json at the root with only a browserslist'] = { ...STARTER, 'package.json': '{ "browserslist": ["ie 11"] }\n' }
CASES['package.json at the root with only a name'] = { ...STARTER, 'package.json': '{ "name": "x" }\n' }
CASES['app/ plus all of conexus/ (handler imports conexus/lib), root files left out'] = { ...STARTER, 'conexus/manifest.json': MANIFEST,
  'conexus/lib/total.ts': 'export const total = (): number => 3\n',
  'conexus/handlers/notes.ts': "import { total } from '../lib/total.ts'\nexport async function countNotes(): Promise<{ total: number }> {\n  return { total: total() }\n}\n" }
if (process.env.SPIKE_ONLY) for (const name of Object.keys(CASES)) if (!name.includes(process.env.SPIKE_ONLY)) delete CASES[name]

const previewTree = (files) => Object.fromEntries(Object.entries(files).filter(([path]) =>
  path.startsWith('app/') || SERVER_SOURCE_ROOTS.some((root) => path === root || path.startsWith(`${root}/`))))
// The tree a clean PR would check and publish: app/ and all of conexus/, nothing at the root.
const applicationTree = (files) => Object.fromEntries(Object.entries(files).filter(([path]) => path.startsWith('app/') || path.startsWith('conexus/')))

const runCheck = (files) => {
  const scratch = mkdtempSync(join(tmpdir(), 'conexus-parity-'))
  try {
    const root = join(scratch, 'repo')
    const tools = join(scratch, 'opt')
    const out = join(scratch, 'dist')
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    mkdirSync(join(tools, 'compiler'), { recursive: true })
    for (const name of ['node_modules', 'full']) symlinkSync(join(compilerRoot, name), join(tools, 'compiler', name))
    for (const name of ['allowlist.mjs', 'generate-client.mjs', 'tsconfig.mjs', 'package.json']) copyFileSync(join(compilerRoot, name), join(tools, 'compiler', name))
    writeFileSync(join(tools, 'compiler/vite.config.mjs'), readFileSync(join(compilerRoot, 'vite.config.mjs'), 'utf8').replace("'/workspace/.vite'", JSON.stringify(join(scratch, 'vite-cache'))))
    writeFileSync(join(tools, 'server-build.mjs'), serverBuildScriptSource().replaceAll('/opt/conexus/compiler', join(tools, 'compiler')))
    const script = join(scratch, 'check.mjs')
    writeFileSync(script, checkScriptSource())
    const ran = spawnSync(process.execPath, [script, '--root', root, '--out', out, '--tools', tools, '--home', scratch, '--chromium', chromium.executablePath()], { encoding: 'utf8', timeout: 240_000 })
    const report = parseCheckReport(ran.stdout)
    const digests = report.ok ? Object.fromEntries(readdirSync(out, { recursive: true }).map(String).filter((path) => statSync(join(out, path)).isFile()).sort()
      .map((path) => [path, createHash('sha256').update(readFileSync(join(out, path))).digest('hex').slice(0, 16)])) : null
    const problems = report.steps.filter((step) => step.status === 'failed').map((step) => `${step.step}: ${step.problems.map((problem) => problem.message.split('\n')[0]).join(' | ').slice(0, 300)}`)
    return { summary: checkSummary(report).replace(/:\d+ms/g, ''), ok: report.ok, digests, problems }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

for (const [name, files] of Object.entries(CASES)) {
  const full = runCheck(files)
  const preview = runCheck(process.env.SPIKE_COMPARE === 'application' ? applicationTree(files) : previewTree(files))
  const same = full.digests && preview.digests && JSON.stringify(full.digests) === JSON.stringify(preview.digests)
  console.log(`\n## ${name}`)
  console.log(`full    : ${full.summary}${full.problems.length ? `\n          ${full.problems.join('\n          ')}` : ''}`)
  console.log(`preview : ${preview.summary}${preview.problems.length ? `\n          ${preview.problems.join('\n          ')}` : ''}`)
  if (full.digests && preview.digests) {
    const paths = [...new Set([...Object.keys(full.digests), ...Object.keys(preview.digests)])].sort()
    const differing = paths.filter((path) => full.digests[path] !== preview.digests[path])
    console.log(`build   : ${same ? `IDENTICAL (${paths.length} files)` : `DIFFERENT: ${differing.join(', ')}`}`)
  } else console.log(`build   : full ${full.ok ? 'collected' : 'refused'}, preview ${preview.ok ? 'collected' : 'refused'}`)
}
