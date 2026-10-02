// The Hub process of a scripted live run: the real composition (`startHub`), with its conversations'
// sandboxes on this machine instead of E2B. Started by control.mjs's launch with the Hub's build and
// the sandbox root as arguments.
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Mastra reads this as it loads, and the sandbox stand-in imports Mastra.
process.env.MASTRA_TELEMETRY_DISABLED = '1'
const { localConversationSandboxes } = await import('./local-sandbox.mjs')
const [buildRoot, sandboxRoot] = process.argv.slice(2)
const built = (path) => import(pathToFileURL(resolve(buildRoot, path)).href)
const { startHub } = await built('hub.js')
const { BUILDER_WORKSPACE_TOOLS_CONFIG } = await built('builder/sandbox.js')
const hub = await startHub({ conversationSandboxes: localConversationSandboxes(sandboxRoot, BUILDER_WORKSPACE_TOOLS_CONFIG) })
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void hub.close() })
