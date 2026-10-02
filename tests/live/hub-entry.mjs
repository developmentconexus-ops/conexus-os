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
const { BUILDER_WORKSPACE_TOOLS_CONFIG } = await built('builder/sandbox.js')
exitOnSignals((await startHub({ conversationSandboxes: localConversationSandboxes(sandboxRoot, BUILDER_WORKSPACE_TOOLS_CONFIG) })).close)
