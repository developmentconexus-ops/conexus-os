import { isAbsolute, join } from 'node:path'
import { MC_TOOLS } from '@mastra/code-sdk/tool-names'
import type { CommandResult, SandboxFileInput } from '@mastra/core/workspace'

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

export const BUILDER_BASE_AGENT_INSTRUCTIONS = [
  'Work only in the exact Session Workspace at /workspace/repo.',
  'For ordinary Builder work, keep application edits under /workspace/repo/app/**.',
  'Use the fixed REACT_VITE_V1 application shape.',
  'Do not install or add package dependencies.',
  'Do not mutate Conexus platform or generated owner files.',
  'Do not add Git remotes, use network access, or read credentials.',
  'Inspect before editing and run focused local checks when useful.',
  'Reply to the operator in português brasileiro unless explicitly asked otherwise.',
  'Keep progress brief and never reveal chain-of-thought.',
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

const inspectAppEntry = async (
  directCommand: FixedApplicationStarterWorkspace['directCommand'],
  appPath: string,
): Promise<'ABSENT' | 'PRESENT' | 'UNSAFE'> => {
  const result = await directCommand('sh', [
    '-c',
    'if [ -L "$1" ]; then printf UNSAFE; elif [ -e "$1" ]; then printf PRESENT; else printf ABSENT; fi',
    'conexus-fixed-application-starter',
    appPath,
  ])
  if (!result.success || result.stderr) {
    throw new Error('BUILDER_STARTER_ENTRY_INSPECTION_FAILED')
  }
  const state = result.stdout.trim()
  if (state === 'ABSENT' || state === 'PRESENT' || state === 'UNSAFE') return state
  throw new Error('BUILDER_STARTER_ENTRY_INSPECTION_FAILED')
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
  const entry = await inspectAppEntry(directCommand, appPath)
  if (entry === 'UNSAFE') throw new Error('BUILDER_STARTER_ENTRY_UNSAFE')
  if (entry === 'PRESENT') return 'PRESERVED'

  await writeFiles(FIXED_APPLICATION_STARTER_FILES.map((file) => ({
    path: join(repositoryRoot, file.path),
    content: file.content,
  })))
  return 'MATERIALIZED'
}
