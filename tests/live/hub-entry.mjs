// The Hub process of a scripted live run: the real composition (`startHub`), with its conversations'
// sandboxes on this machine instead of E2B. Started by control.mjs's launch with the Hub's build and
// the sandbox root as arguments.
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Mastra reads this as it loads, and the sandbox stand-in imports Mastra.
process.env.MASTRA_TELEMETRY_DISABLED = '1'
const [buildRoot, sandboxRoot] = process.argv.slice(2)
const built = (path) => import(pathToFileURL(resolve(buildRoot, path)).href)
// As in server.ts: installed before the Hub's modules load.
const { exitOnSignals, installFatalHandlers } = await built('platform/lifecycle.js')
installFatalHandlers()
const { localConversationSandboxes } = await import('./local-sandbox.mjs')
const { startHub } = await built('hub.js')
const { createConversationSandbox, createRunWorkspace } = await built('builder/sandbox.js')
const workspaceTools = createRunWorkspace(createConversationSandbox({ apiKey: 'unused', templateId: 'unused', conversationId: '00000000-0000-4000-8000-000000000001', providerSandboxId: null, idleMs: 300_000 })).getToolsConfig()
const { readCheckReport } = await built('builder/application-check.js')
const { createMirrorFeed } = await built('builder/run/mirror.js')
const { checkEntryPath, loadCheckBundle } = await built('builder/check-delivery.js')
const { CURRENT_TEMPLATE_PIN } = await built('registry/application-template-pins.js')
// A manual proof on real E2B passes `e2b` as the third argument: the Hub then opens its own sandboxes.
const realE2B = process.argv[4] === 'e2b'
exitOnSignals((await startHub(realE2B ? {} : { conversationSandboxes: localConversationSandboxes(sandboxRoot, workspaceTools, { check: loadCheckBundle(), readCheckReport, checkEntryPath, createMirrorFeed, templateRef: CURRENT_TEMPLATE_PIN.templateRef }) })).close)
