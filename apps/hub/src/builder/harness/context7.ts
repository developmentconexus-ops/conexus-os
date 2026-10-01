import { MCPClient } from '@mastra/mcp'
import type { ToolsInput } from '@mastra/core/agent'

/** @public Tests import this at runtime from the built module. */
export const CONTEXT7_URL = 'https://mcp.context7.com/mcp'
const CONTEXT7_RESOLVE_TOOL = 'context7_resolve_library_id'
const CONTEXT7_QUERY_TOOL = 'context7_query_docs'

const DISCOVERY_TIMEOUT_MS = 3_000
const CALL_TIMEOUT_MS = 20_000
const RETRY_AFTER_FAILURE_MS = 60_000

const RESOLVE_DESCRIPTION = [
  "Finds Context7's id for a library or framework, such as Hono or TanStack Query, so `context7_query_docs` can read its current documentation.",
  'Use it, then `context7_query_docs`, before you write code against a library API you are not sure of; skip it for what the checkout already shows you or you know well.',
  'Takes `libraryName` and `query`, what you need the library for. Write both in English and send only the library name and a general technical question, never anything from this company or Project.',
  'Returns the matching libraries, each with its id, description and how much documentation it has; pick the one whose name and description fit best.',
  'It needs the internet: if it returns an error, go on without it and read the code in the checkout.',
].join(' ')

const QUERY_DESCRIPTION = [
  "Reads the current documentation of one library from Context7, for the `libraryId` that `context7_resolve_library_id` returned, as `/org/project`.",
  'Takes `libraryId` and `query`, a specific technical question in English, such as "how to define a route with a path parameter". Send nothing from this company or Project.',
  'Returns the documentation passages and code examples that answer it. Trust them over what you remember when they differ, and check them against the version the app installs.',
  'It needs the internet: if it returns an error, go on without it and read the code in the checkout.',
].join(' ')

const REMOTE_TOOLS: Readonly<Record<string, Readonly<{ name: string; description: string }>>> = Object.freeze({
  'context7_resolve-library-id': { name: CONTEXT7_RESOLVE_TOOL, description: RESOLVE_DESCRIPTION },
  'context7_query-docs': { name: CONTEXT7_QUERY_TOOL, description: QUERY_DESCRIPTION },
})

export type DocsTools = Readonly<{
  /** The two Context7 tools, or none when Context7 cannot be reached; never throws, and asks again only after a pause. */
  tools: () => Promise<ToolsInput>
  close: () => Promise<void>
}>

export type Context7Options = Readonly<{
  /** The installation's Context7 key; anonymous when absent. Sent only to `url`, never printed. */
  apiKey?: string | undefined
  /** Only tests change these. */
  url?: string
  now?: () => number
}>

/**
 * Context7's documentation lookup as two Builder tools, over Mastra's own MCP client. Only the Hub
 * calls Context7, only the library name and the question leave, and the client refuses any host but
 * `url`'s. Context7 being down costs the Builder these tools, never the run.
 */
export const createContext7Docs = (options: Context7Options = {}): DocsTools => {
  const url = new URL(options.url ?? CONTEXT7_URL)
  const now = options.now ?? Date.now
  const client = new MCPClient({
    id: 'conexus-context7',
    timeout: CALL_TIMEOUT_MS,
    servers: {
      context7: {
        url,
        allowedHosts: [url.host],
        ...(options.apiKey ? { requestInit: { headers: { Authorization: `Bearer ${options.apiKey}` } } } : {}),
      },
    },
  })
  let found: ToolsInput | undefined
  let failedAt: number | undefined

  const discover = async (): Promise<ToolsInput> => {
    const { tools } = await client.listToolsWithErrors({ perServerTimeoutMs: DISCOVERY_TIMEOUT_MS }).catch(() => ({ tools: {} }))
    const wrapped: ToolsInput = {}
    for (const [remoteName, tool] of Object.entries(tools)) {
      const exposed = REMOTE_TOOLS[remoteName]
      if (!exposed) continue
      const call = tool.execute
      if (!call) continue
      wrapped[exposed.name] = {
        ...tool,
        id: exposed.name,
        description: exposed.description,
        execute: async (input: unknown, context: Parameters<typeof call>[1]) => {
          try {
            return await call(input, context)
          } catch {
            return { content: 'Context7 could not answer now. Go on without it and read the code in the checkout.', isError: true }
          }
        },
      }
    }
    return wrapped
  }

  return Object.freeze({
    tools: async () => {
      if (found) return found
      if (failedAt !== undefined && now() - failedAt < RETRY_AFTER_FAILURE_MS) return {}
      const discovered = await discover()
      if (Object.keys(discovered).length === Object.keys(REMOTE_TOOLS).length) {
        found = discovered
        return found
      }
      failedAt = now()
      return {}
    },
    close: () => client.disconnect().catch(() => undefined),
  })
}
