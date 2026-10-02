import { createTool, webFetchTool } from '@mastra/core/tools'

const DESCRIPTION = [
  'Reads one public web page, such as a library guide or a package page, and returns its text.',
  'Takes `url`, one plain http or https address with no query string, no `#` part and no user or password, at most 300 characters. Send nothing from this company or Project: a URL that carries data is refused.',
  'It needs the internet: if it returns an error, go on without it.',
].join(' ')

const MAX_URL_LENGTH = 300
const MAX_SEGMENT_LENGTH = 80
const EMAIL = /\S+@\S+/
const LONG_NUMBER = /\d{6,}/
const PRINTABLE_ASCII = /^[!-~]+$/

/** @public Tests import this at runtime from the built module. */
export const WEB_FETCH_REFUSAL =
  'Refused: fetch only a plain public address, with no query string, no # part and nothing from this company or Project in it. Use a general documentation page, or go on without it.'

/**
 * The tool boundary's check on what leaves in a `web_fetch` URL. The Hub holds no list of the values
 * the Builder read through Conexões, so this cannot prove a URL is free of company data. It refuses
 * the places data travels most easily: the query string, the fragment and credentials. It bounds the
 * URL and each path segment, and refuses paths shaped like emails or long numbers. A short path
 * segment of company words still passes. Mastra's tool itself sends only GET, refuses private,
 * loopback and link-local addresses, also after DNS, and checks each redirect again.
 * @public Tests import this at runtime from the built module.
 */
export const outboundUrl = (input: unknown): string | undefined => {
  if (typeof input !== 'string' || input.length > MAX_URL_LENGTH) return undefined
  if (!PRINTABLE_ASCII.test(input) || /[?#]/.test(input)) return undefined
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return undefined
  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    return undefined
  }
  if (EMAIL.test(path) || LONG_NUMBER.test(path)) return undefined
  if (path.split('/').some((segment) => segment.length > MAX_SEGMENT_LENGTH)) return undefined
  return url.toString()
}

const { inputSchema, outputSchema, execute: fetchPage } = webFetchTool
if (!inputSchema || !outputSchema || !fetchPage) throw new Error('Mastra web_fetch no longer has its schemas or execute.')

/** Mastra's `web_fetch`, called only with a URL `outboundUrl` accepted. */
export const guardedWebFetchTool = createTool({
  id: 'web_fetch',
  description: DESCRIPTION,
  inputSchema,
  outputSchema,
  execute: async (input, context) => {
    const url = outboundUrl((input as { url?: unknown }).url)
    if (!url) return { content: WEB_FETCH_REFUSAL, isError: true }
    try {
      return await fetchPage({ url }, context)
    } catch {
      return { content: 'The page could not be fetched now. Go on without it.', isError: true }
    }
  },
})
