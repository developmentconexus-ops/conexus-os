// The Hub process of a scripted live run: the real composition (`startHub`), with its conversations'
// sandboxes on this machine instead of E2B. Started by control.mjs's launch with the Hub's build and
// the sandbox root as arguments.
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
const { parseCheckReport } = await built('builder/application-check.js')
const { createApplicationArtifactStore } = await built('registry/module.js')
// While this file is in the sandbox root the registry refuses every build, so a flow can meet a
// Conexus failure after a green check.
const REGISTRY_REFUSES = 'registry-refuses'
const registry = createApplicationArtifactStore()
exitOnSignals((await startHub({
  conversationSandboxes: localConversationSandboxes(sandboxRoot, BUILDER_WORKSPACE_TOOLS_CONFIG, parseCheckReport),
  applicationArtifacts: {
    ...registry,
    retainApplication: async (client, input) => {
      if (existsSync(join(sandboxRoot, REGISTRY_REFUSES))) throw new Error('APPLICATION_ARTIFACT_INPUT_REFUSED')
      return registry.retainApplication(client, input)
    },
  },
})).close)
