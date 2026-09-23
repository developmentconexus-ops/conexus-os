import { isAbsolute, join } from 'node:path'
import type { CommandResult, SandboxFileInput } from '@mastra/core/workspace'
import { BUILD_COMMAND } from './application-artifact-runtime.js'
import { SERVER_BUILD_SCRIPT_PATH } from './application-server-build.js'

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

// The paved road for server logic and saved data, kept in the Project's own source so the Builder
// reads it when the request needs it and the check enforces the same shape.
const SERVER_GUIDE = `---
name: conexus-server
description: Use when an app needs server logic, saved data, or browser calls to Project operations.
---

# Server logic and saved data

Read this only when the app must save data or run logic on the server. The browser app stays in \`app/\`.

Everything server-side lives under \`conexus/\`:

- \`manifest.json\` declares each operation the browser may call.
- \`handlers/*.ts\` implement them.
- \`migrations/NNN_name.sql\` create and change tables, applied in name order before the Preview opens.
  Never edit a migration that has already run; add the next one. Editing one erases this Project's
  Preview data and replays every migration.

## manifest.json

\`\`\`json
{
  "operations": {
    "listItems": {
      "handler": "handlers/items.ts",
      "export": "listItems",
      "input": { "type": "object", "properties": { "category": { "type": "string", "maxLength": 80 } }, "required": ["category"], "additionalProperties": false },
      "output": { "type": "array", "maxItems": 500, "items": { "type": "object", "properties": { "id": { "type": "integer" }, "name": { "type": "string" } }, "required": ["id", "name"], "additionalProperties": false } }
    }
  }
}
\`\`\`

A schema uses only these types: \`string\` (\`minLength\`, \`maxLength\`), \`integer\` and \`number\`
(\`minimum\`, \`maximum\`), \`boolean\`, \`object\` (\`properties\`, \`required\`, and \`"additionalProperties": false\`,
which is mandatory) and \`array\` (\`items\`, \`maxItems\`). Input is always an object. A value that does
not match its schema exactly, including an undeclared field, is refused.

## Handlers

\`\`\`ts
type Db = { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }

export async function listItems(input: { category: string }, { db }: { db: Db }) {
  const { rows } = await db.query('SELECT id, name FROM item WHERE category = $1 ORDER BY id', [input.category])
  return rows
}
\`\`\`

- Always pass values as parameters (\`$1\`, \`$2\`). Tables live in this Project's own schema: do not
  prefix them with a schema name.
- A handler may import only files inside \`conexus/\` and \`node:\` built-ins. There are no npm packages,
  no network, no file system and no environment variables. Each call runs isolated for at most 5
  seconds and answers at most 1 MiB.
- Postgres \`integer\` arrives as a number; \`bigint\` and \`numeric\` arrive as strings; \`timestamptz\`
  arrives as an ISO string. Alias columns to the names the output schema declares, for example
  \`created_at AS "createdAt"\`.

## Migrations

\`conexus/migrations/001_create_item.sql\`:

\`\`\`sql
CREATE TABLE item (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
\`\`\`

A migration may create and alter tables, indexes, constraints and views in this Project's schema
only: no functions, procedures, triggers, DO blocks, extensions, roles, grants or other schemas.

## Calling an operation from the browser

\`\`\`ts
const response = await fetch('/__conexus/api/listItems', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ category: 'a' }),
})
if (!response.ok) {
  const { error } = await response.json() // { code, detail? }
  // show the failure; the app must keep rendering
} else {
  const items = await response.json()
}
\`\`\`

The build check answers every operation with the smallest value its output schema admits, so the
app must render with empty data as well as when a call fails.

\`sh conexus/check.sh\` builds \`app/\`, then validates \`manifest.json\`, bundles the handlers and lists
the migrations. Fix whatever it reports.
`

// A repository-hosted Project carries its own check: the template's compiler, bound in place, with
// its output kept out of /workspace/dist, where Conexus's own compile writes the Preview.
export const APPLICATION_CHECK_FILES = Object.freeze([
  Object.freeze({ path: 'conexus.json', content: `${JSON.stringify({ shape: 'REACT_VITE_V1', check: 'sh conexus/check.sh' }, null, 2)}\n` }),
  Object.freeze({
    path: 'conexus/check.sh',
    content: [
      '#!/bin/sh',
      '# Builds app/ and the conexus/ server half the way Conexus builds them before a Preview. Run it from the repository root.',
      'set -eu',
      'root=$(cd "$(dirname "$0")/.." && pwd)',
      'ln -sfn /opt/conexus/compiler/node_modules "$root/app/node_modules"',
      'cd "$root/app"',
      `CONEXUS_COMPILE_ROOT="$root/app" ${BUILD_COMMAND} --outDir /tmp/conexus-check-dist --emptyOutDir`,
      `node ${SERVER_BUILD_SCRIPT_PATH} "$root" /tmp/conexus-check-dist`,
      '',
    ].join('\n'),
  }),
  Object.freeze({ path: '.agents/skills/conexus-server/SKILL.md', content: SERVER_GUIDE }),
] as const)

// The check links the compiler's dependencies into app/, and that link must never reach the tree.
// The Factory runs a repository's setup command in every new checkout, before the agent.
export const APPLICATION_CHECK_SETUP_COMMAND = 'mkdir -p .git/info && { grep -qxF /app/node_modules .git/info/exclude 2>/dev/null || echo /app/node_modules >> .git/info/exclude; }'

export const APPLICATION_CHECK_INSTRUCTION = 'Before finishing a BUILD, run `sh conexus/check.sh` at the repository root and fix what it reports.'

export const BUILDER_SHARED_AGENT_INSTRUCTIONS = Object.freeze([
  'Work only in the exact Session Workspace at /workspace/repo.',
  'Keep application edits under /workspace/repo/app/**, except server logic and saved data under /workspace/repo/conexus/**; load the `conexus-server` skill before editing those.',
  'Use the fixed REACT_VITE_V1 application shape.',
  'Do not install or add package dependencies.',
  'Do not mutate Conexus platform or generated owner files.',
  'Do not add Git remotes or read credentials.',
  'Inspect before editing and run focused local checks when useful.',
  'Reply to the operator in português brasileiro unless explicitly asked otherwise.',
  'Keep progress brief and never reveal chain-of-thought.',
])

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
