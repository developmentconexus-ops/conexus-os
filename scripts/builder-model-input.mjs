#!/usr/bin/env node
// Prints the input the Builder's model receives (spec 0002 AC-1, AC-30), built in process by the
// same functions the Builder controller uses. No model call, no network.
//
//   node scripts/builder-model-input.mjs --project <git checkout> --thread <id> \
//     --mode planejar|construir --model provider/model [--revision <git revision>]
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { RequestContext } from '@mastra/core/request-context'
import { InMemoryStore } from '@mastra/core/storage'
import { hubModuleUrl } from '../tests/implementation/hub-build.mjs'

const MODE_IDS = { planejar: 'plan', construir: 'build' }

const USAGE = 'usage: builder-model-input.mjs --project <git checkout> --thread <id> --mode planejar|construir --model provider/model [--revision <rev>]'

/** The AGENTS.md at `revision` of the Project's repository, as the Hub reads it from `main`. */
const readAgentsBlob = (projectDir, revision) => {
  try {
    const bytes = new Uint8Array(execFileSync('git', ['-C', projectDir, 'cat-file', 'blob', `${revision}:AGENTS.md`], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 2 * 1024 * 1024 }))
    return { type: 'blob', size: bytes.length, bytes }
  } catch {
    return null
  }
}

export const buildModelInput = async ({ project, thread, mode, model, revision = 'HEAD' }) => {
  const modeId = MODE_IDS[mode]
  if (!modeId) throw new Error(`mode must be planejar or construir, got "${mode}"`)
  const projectDir = resolve(project)
  const resolvedRevision = execFileSync('git', ['-C', projectDir, 'rev-parse', '--verify', `${revision}^{commit}`], { encoding: 'utf8' }).trim()

  const { BUILDER_MODES } = await import(hubModuleUrl('builder/harness/modes.js'))
  const { CONEXUS_PROJECT_KNOWLEDGE_KEY } = await import(hubModuleUrl('builder/harness/request-context.js'))
  const { conexusInstructions } = await import(hubModuleUrl('builder/harness/prompt.js'))
  const { readProjectKnowledge } = await import(hubModuleUrl('builder/project-knowledge.js'))
  const { createBuilderController, defaultBuilderSkillsRoot } = await import(hubModuleUrl('builder/harness/controller.js'))

  const requestContext = new RequestContext()
  requestContext.set('controller', { session: { modeId } })
  requestContext.setRaw(CONEXUS_PROJECT_KNOWLEDGE_KEY, readProjectKnowledge(readAgentsBlob(projectDir, resolvedRevision)))
  const instructions = conexusInstructions()({ requestContext })

  // conexus_check is registered only for a turn with a run behind it, and web_search only for a model with native search.
  const controller = createBuilderController({
    model,
    storage: new InMemoryStore(),
    skillsPath: defaultBuilderSkillsRoot(),
    runCheck: modeId === 'build' ? () => async () => ({ ok: true, steps: [], facts: {} }) : undefined,
  })
  const session = await controller.createSession({ resourceId: `project:${thread}`, scope: thread })
  const registered = new Set(Object.keys(await controller.getCurrentAgent(session).listTools({ requestContext })))
  const conditional = new Set(['connector_fetch', 'conexus_check', 'web_search'])
  const tools = [...BUILDER_MODES[modeId].availableTools].filter((name) => !conditional.has(name) || registered.has(name)).sort()

  return [
    `Project: ${projectDir}`,
    `Thread: ${thread}`,
    `Mode: ${mode} (${modeId})`,
    `Model: ${model}`,
    `Revision: ${resolvedRevision}`,
    '',
    '=== INSTRUCTIONS (system text: Conexus prompt, mode prompt, Project knowledge) ===',
    instructions,
    '',
    '=== TOOLS (by name) ===',
    ...tools,
    '',
    '=== NOT SHOWN HERE ===',
    'Mastra adds its own workspace description and agent skill list at run time. connector_fetch and the connector brief appear only for a run with connectors.',
    '',
  ].join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { project: { type: 'string' }, thread: { type: 'string' }, mode: { type: 'string' }, model: { type: 'string' }, revision: { type: 'string' } } })
  if (!values.project || !values.thread || !values.mode || !values.model) { console.error(USAGE); process.exit(2) }
  try {
    process.stdout.write(await buildModelInput(values))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
