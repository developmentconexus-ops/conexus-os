import { isAbsolute, join } from 'node:path'
import { MC_TOOLS } from '@mastra/code-sdk/tool-names'
import type { CommandResult, SandboxFileInput } from '@mastra/core/workspace'
import { BUILD_COMMAND } from './application-artifact-runtime.js'

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

// A repository-hosted Project carries its own check: the template's compiler, bound in place, with
// its output kept out of /workspace/dist, where Conexus's own compile writes the Preview.
export const APPLICATION_CHECK_FILES = Object.freeze([
  Object.freeze({ path: 'conexus.json', content: `${JSON.stringify({ shape: 'REACT_VITE_V1', check: 'sh conexus/check.sh' }, null, 2)}\n` }),
  Object.freeze({
    path: 'conexus/check.sh',
    content: [
      '#!/bin/sh',
      '# Builds app/ the way Conexus builds it before a Preview. Run it from the repository root.',
      'set -eu',
      'root=$(cd "$(dirname "$0")/.." && pwd)',
      'ln -sfn /opt/conexus/compiler/node_modules "$root/app/node_modules"',
      'cd "$root/app"',
      `CONEXUS_COMPILE_ROOT="$root/app" exec ${BUILD_COMMAND} --outDir /tmp/conexus-check-dist --emptyOutDir`,
      '',
    ].join('\n'),
  }),
  // The check links the compiler's dependencies into app/, and that link must never reach the tree.
  Object.freeze({ path: '.gitignore', content: '/app/node_modules\n' }),
] as const)

export const APPLICATION_CHECK_INSTRUCTION = 'Before finishing a BUILD, run `sh conexus/check.sh` at the repository root and fix what it reports.'

export const BUILDER_SHARED_AGENT_INSTRUCTIONS = Object.freeze([
  'Work only in the exact Session Workspace at /workspace/repo.',
  'For ordinary Builder work, keep application edits under /workspace/repo/app/**.',
  'Use the fixed REACT_VITE_V1 application shape.',
  'Do not install or add package dependencies.',
  'Do not mutate Conexus platform or generated owner files.',
  'Do not add Git remotes or read credentials.',
  'Inspect before editing and run focused local checks when useful.',
  'Reply to the operator in português brasileiro unless explicitly asked otherwise.',
  'Keep progress brief and never reveal chain-of-thought.',
])

export const BUILDER_BASE_AGENT_INSTRUCTIONS = [
  ...BUILDER_SHARED_AGENT_INSTRUCTIONS,
  'The trusted compiler runs separately; do not claim that unavailable application dependencies were tested in this coding image.',
].join(' ')

export const BUILDER_MODE_INSTRUCTIONS = Object.freeze({
  BUILD: 'No modo BUILD, implemente o pedido do operador. Inspecione o app existente primeiro, depois faça as edições comuns necessárias em /workspace/repo/app. Continue até implementar o pedido ou encontrar um bloqueio real. Relate cada ação importante e seu resultado visível de forma breve.',
  PLAN: 'No modo PLAN, use somente leitura para explicar o que seria alterado. Não mude arquivos, instale dependências, execute comandos de mutação nem diga que um Build ocorreu.',
})

export const BUILDER_MODE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'build', name: 'Build', instructions: BUILDER_MODE_INSTRUCTIONS.BUILD,
    availableTools: Object.freeze([MC_TOOLS.VIEW, MC_TOOLS.WRITE_FILE, MC_TOOLS.STRING_REPLACE_LSP, MC_TOOLS.FIND_FILES, MC_TOOLS.DELETE_FILE, MC_TOOLS.FILE_STAT, MC_TOOLS.MKDIR, MC_TOOLS.SEARCH_CONTENT, MC_TOOLS.EXECUTE_COMMAND]),
  }),
  Object.freeze({
    id: 'plan', name: 'Plan', instructions: BUILDER_MODE_INSTRUCTIONS.PLAN,
    availableTools: Object.freeze([MC_TOOLS.VIEW, MC_TOOLS.FIND_FILES, MC_TOOLS.FILE_STAT, MC_TOOLS.SEARCH_CONTENT]),
  }),
] as const)

const EVIDENCE_LIMIT = 400

// A failed command's output is the only record of why it failed, so it is kept, but it can carry a
// Git header or a token from whatever produced it, and it goes to a log.
export const commandEvidence = (text: string): string => {
  const redacted = text
    .replace(/(authorization:\s*)(?:(?:basic|bearer|token)\s+)?\S+/gi, '$1[redacted]')
    .replace(/x-access-token:[^@\s]+/gi, 'x-access-token:[redacted]')
    .replace(/\bgh[pousr]_[A-Za-z0-9_]+/g, '[redacted]')
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

/** Writes each application check file the checkout lacks; an existing one is the repository's. */
export const materializeApplicationCheck = async ({
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
  for (const file of APPLICATION_CHECK_FILES) {
    const path = join(repositoryRoot, file.path)
    const entry = await inspectEntry(directCommand, path)
    if (entry === 'UNSAFE') throw new Error('BUILDER_STARTER_ENTRY_UNSAFE')
    if (entry === 'ABSENT') missing.push({ path, content: file.content })
  }
  if (missing.length > 0) await writeFiles(missing)
}
