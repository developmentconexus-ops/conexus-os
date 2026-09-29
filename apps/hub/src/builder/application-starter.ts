import { isAbsolute, join } from 'node:path'
import type { CommandResult, SandboxFileInput } from '@mastra/core/workspace'
import { redactEvidence } from './application-check.js'

export type FixedApplicationStarterResult = 'MATERIALIZED' | 'PRESERVED'

export type FixedApplicationStarterWorkspace = Readonly<{
  directCommand(command: string, args: readonly string[]): Promise<CommandResult>
  writeFiles(files: SandboxFileInput[]): Promise<void>
}>

export const FIXED_APPLICATION_STARTER_FILES = Object.freeze([
  Object.freeze({
    path: 'app/index.html',
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Conexus app</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  }),
  Object.freeze({
    path: 'app/src/main.tsx',
    content: `import * as React from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

const root = document.getElementById('root')
if (!root) throw new Error('CONEXUS_APP_ROOT_MISSING')

createRoot(root).render(
  <React.StrictMode>
    <div />
  </React.StrictMode>,
)
`,
  }),
  Object.freeze({
    path: 'app/src/style.css',
    content: `:root {
  font-family: system-ui, sans-serif;
  color: #111;
  background: #fff;
}

body {
  margin: 0;
}
`,
  }),
] as const)

// A Project's shape file. The check that admits its source is the Hub's own script, never a file of
// the Project's, so the shape says nothing about how it is checked.
export const APPLICATION_SHAPE_FILES = Object.freeze([
  Object.freeze({ path: 'conexus.json', content: `${JSON.stringify({ shape: 'REACT_VITE_V1' }, null, 2)}\n` }),
] as const)

// Kept out of every candidate: the link the build makes into app/, and the files the platform
// generates from the manifest, which it regenerates for every check and so never takes from a run.
export const APPLICATION_CHECK_EXCLUDED = Object.freeze(['app/node_modules', '*.gen.ts'])

const EVIDENCE_LIMIT = 400

// A failed command's output is the only record of why it failed, so it is kept, but it can carry a
// Git header or a token from whatever produced it, and it goes to a log.
export const commandEvidence = (text: string): string => {
  const redacted = redactEvidence(text)
  return redacted.length > EVIDENCE_LIMIT ? `${redacted.slice(0, EVIDENCE_LIMIT)}…` : redacted
}

const inspectEntry = async (
  directCommand: FixedApplicationStarterWorkspace['directCommand'],
  appPath: string,
): Promise<'ABSENT' | 'PRESENT' | 'UNSAFE'> => {
  const result = await directCommand('sh', [
    '-c',
    'if [ -L "$1" ]; then printf UNSAFE; elif [ -e "$1" ]; then printf PRESENT; else printf ABSENT; fi',
    'conexus-fixed-application-starter',
    appPath,
  ])
  const state = result.stdout.trim()
  if (result.exitCode === 0 && (state === 'ABSENT' || state === 'PRESENT' || state === 'UNSAFE')) return state
  throw new Error('BUILDER_STARTER_ENTRY_INSPECTION_FAILED', {
    cause: { exitCode: result.exitCode, stdout: commandEvidence(result.stdout), stderr: commandEvidence(result.stderr) },
  })
}

export const materializeFixedApplicationStarter = async ({
  repositoryRoot,
  directCommand,
  writeFiles,
}: Readonly<{
  repositoryRoot: string
  directCommand: FixedApplicationStarterWorkspace['directCommand']
  writeFiles: FixedApplicationStarterWorkspace['writeFiles']
}>): Promise<FixedApplicationStarterResult> => {
  if (!isAbsolute(repositoryRoot) || repositoryRoot.includes('\0')) throw new Error('BUILDER_STARTER_ROOT_REFUSED')
  const appPath = join(repositoryRoot, 'app')
  const entry = await inspectEntry(directCommand, appPath)
  if (entry === 'UNSAFE') throw new Error('BUILDER_STARTER_ENTRY_UNSAFE')
  if (entry === 'PRESENT') return 'PRESERVED'

  await writeFiles(FIXED_APPLICATION_STARTER_FILES.map((file) => ({
    path: join(repositoryRoot, file.path),
    content: file.content,
  })))
  return 'MATERIALIZED'
}

/** Writes each shape file the checkout lacks; an existing one is the repository's. */
export const materializeApplicationShape = async ({
  repositoryRoot,
  directCommand,
  writeFiles,
}: Readonly<{
  repositoryRoot: string
  directCommand: FixedApplicationStarterWorkspace['directCommand']
  writeFiles: FixedApplicationStarterWorkspace['writeFiles']
}>): Promise<void> => {
  if (!isAbsolute(repositoryRoot) || repositoryRoot.includes('\0')) throw new Error('BUILDER_STARTER_ROOT_REFUSED')
  const missing: SandboxFileInput[] = []
  for (const file of APPLICATION_SHAPE_FILES) {
    const path = join(repositoryRoot, file.path)
    const entry = await inspectEntry(directCommand, path)
    if (entry === 'UNSAFE') throw new Error('BUILDER_STARTER_ENTRY_UNSAFE')
    if (entry === 'ABSENT') missing.push({ path, content: file.content })
  }
  if (missing.length > 0) await writeFiles(missing)
}

const STALE_SERVER_SKILL_PATH = '.agents/skills/conexus-server'

/**
 * Deletes a checkout's own copy of the server/data guide, which earlier BUILD runs wrote as
 * `.agents/skills/conexus-server/SKILL.md`. The guide is now an agent level skill of the Hub (served
 * from the Hub's `builder-skills/` folder), so a leftover Project copy is a platform-owned path,
 * like the other generated owner files, and must never shadow the global one.
 */
export const removeStaleServerSkill = async ({
  repositoryRoot,
  directCommand,
}: Readonly<{
  repositoryRoot: string
  directCommand: FixedApplicationStarterWorkspace['directCommand']
}>): Promise<void> => {
  if (!isAbsolute(repositoryRoot) || repositoryRoot.includes('\0')) throw new Error('BUILDER_STARTER_ROOT_REFUSED')
  const target = join(repositoryRoot, STALE_SERVER_SKILL_PATH)
  const result = await directCommand('sh', ['-c', 'rm -rf -- "$1"', 'conexus-fixed-application-starter', target])
  if (result.exitCode !== 0) {
    throw new Error('BUILDER_STARTER_STALE_SKILL_REMOVAL_FAILED', {
      cause: { exitCode: result.exitCode, stdout: commandEvidence(result.stdout), stderr: commandEvidence(result.stderr) },
    })
  }
}
