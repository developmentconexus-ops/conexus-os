import { z } from 'zod'
import type { CheckFailureCode, Problem } from '../report.js'

const BOOT_CODES = ['BOOT_UNCAUGHT_ERROR', 'BOOT_NO_ROOT_CHILD', 'BOOT_CSP_VIOLATION', 'BOOT_CONSOLE_ERROR', 'BOOT_REQUEST_FAILED'] as const satisfies readonly CheckFailureCode[]
type BootCode = (typeof BOOT_CODES)[number]
export type BootProblem = Problem & Readonly<{ code: BootCode }>

const envelopeSchema = z.object({ id: z.number().optional(), method: z.string().optional(), params: z.record(z.string(), z.unknown()).optional(), result: z.unknown().optional(), error: z.object({ message: z.string() }).optional() })
const requestSchema = z.object({ requestId: z.string(), request: z.object({ url: z.string(), method: z.string() }) })
const pausedSchema = z.object({ requestId: z.string(), request: z.object({ url: z.string() }) })
const responseSchema = z.object({ requestId: z.string(), response: z.object({ url: z.string(), status: z.number() }) })
const loadingSchema = z.object({ requestId: z.string(), canceled: z.boolean().optional(), errorText: z.string() })
const exceptionSchema = z.object({ exceptionDetails: z.object({ url: z.string().optional(), lineNumber: z.number().optional(), columnNumber: z.number().optional(), text: z.string().optional(), exception: z.object({ description: z.string().optional(), value: z.unknown().optional() }).optional() }) })
const consoleSchema = z.object({ type: z.string(), args: z.array(z.object({ value: z.unknown().optional(), description: z.string().optional(), type: z.string().optional() })) })
const cspDetailsSchema = z.object({ isReportOnly: z.boolean().optional(), contentSecurityPolicyViolationType: z.string().optional(), blockedURL: z.string().optional(), violatedDirective: z.string().optional(), sourceCodeLocation: z.object({ url: z.string(), lineNumber: z.number().optional(), columnNumber: z.number().optional() }).optional() })
const issueSchema = z.object({ issue: z.object({ code: z.string(), details: z.object({ contentSecurityPolicyIssueDetails: cspDetailsSchema.optional() }).optional() }) })

type Pending = Readonly<{ resolve(value: unknown): void; reject(error: Error): void }>
type Send = (method: string, params?: object) => Promise<unknown>

/** What the page does that the Preview would show: each problem once, same origin only, the favicon never. */
const pageProblems = (origin: string, send: Send, problems: BootProblem[], loaded: () => void) => {
  const requests = new Map<string, { url: string; method: string }>()
  const sameOrigin = (value: string | undefined): value is string => value?.startsWith(`${origin}/`) ?? false
  const pathOf = (value: string): string => value.slice(origin.length)
  const locationOf = (url: string | undefined, line: number | undefined, column: number | undefined) =>
    sameOrigin(url) ? { file: pathOf(url).slice(1), line: (line ?? 0) + 1, column: (column ?? 0) + 1 } : {}
  const add = (problem: BootProblem): void => {
    if (!problems.some((existing) => existing.code === problem.code && existing.message === problem.message)) problems.push(problem)
  }
  return (method: string | undefined, params: Record<string, unknown>): void => {
    if (method === 'Page.loadEventFired') loaded()
    else if (method === 'Fetch.requestPaused') {
      const event = pausedSchema.safeParse(params)
      if (!event.success) return
      const blocked = !sameOrigin(event.data.request.url)
      void send(blocked ? 'Fetch.failRequest' : 'Fetch.continueRequest', blocked
        ? { requestId: event.data.requestId, errorReason: 'BlockedByClient' } : { requestId: event.data.requestId }).catch(() => undefined)
    } else if (method === 'Runtime.exceptionThrown') {
      const event = exceptionSchema.safeParse(params)
      if (!event.success) return
      const details = event.data.exceptionDetails
      const value = details.exception?.description ?? details.exception?.value ?? details.text ?? 'uncaught exception'
      add({ code: 'BOOT_UNCAUGHT_ERROR', message: String(value).split(`${origin}/`).join(''), ...locationOf(details.url, details.lineNumber, details.columnNumber) })
    } else if (method === 'Runtime.consoleAPICalled') {
      const event = consoleSchema.safeParse(params)
      if (event.success && event.data.type === 'error') add({ code: 'BOOT_CONSOLE_ERROR', message: event.data.args.map((arg) => String(arg.value ?? arg.description ?? arg.type ?? '')).join(' ') })
    } else if (method === 'Audits.issueAdded') {
      const event = issueSchema.safeParse(params)
      const details = event.success && event.data.issue.code === 'ContentSecurityPolicyIssue' ? event.data.issue.details?.contentSecurityPolicyIssueDetails : undefined
      if (!details || details.isReportOnly) return
      const kind = (details.contentSecurityPolicyViolationType ?? 'violation').replace(/^k/, '').replace(/Violation$/, '').toLowerCase()
      const blocked = details.blockedURL ? ` ${details.blockedURL.split(`${origin}/`).join('')}` : ''
      const where = details.sourceCodeLocation
      add({ code: 'BOOT_CSP_VIOLATION', message: `Content Security Policy blocked ${kind}${blocked} under ${details.violatedDirective}`, ...locationOf(where?.url, where?.lineNumber, where?.columnNumber) })
    } else if (method === 'Network.requestWillBeSent') {
      const event = requestSchema.safeParse(params)
      if (event.success) requests.set(event.data.requestId, event.data.request)
    } else if (method === 'Network.responseReceived') {
      const event = responseSchema.safeParse(params)
      if (!event.success) return
      const response = event.data.response
      if (sameOrigin(response.url) && response.status >= 400 && pathOf(response.url) !== '/favicon.ico') add({ code: 'BOOT_REQUEST_FAILED', message: `${requests.get(event.data.requestId)?.method ?? 'GET'} ${pathOf(response.url)} answered ${response.status}` })
    } else if (method === 'Network.loadingFailed') {
      const event = loadingSchema.safeParse(params)
      if (!event.success) return
      const request = requests.get(event.data.requestId)
      if (request && sameOrigin(request.url) && !event.data.canceled && pathOf(request.url) !== '/favicon.ico') add({ code: 'BOOT_REQUEST_FAILED', message: `${request.method} ${pathOf(request.url)} failed: ${event.data.errorText}` })
    }
  }
}

export type Page = Readonly<{ send: Send; close(): void; loaded: Promise<void> }>

/** Opens the page's DevTools socket and collects the page's problems into `problems` as events arrive. */
export const connectPage = async (url: string, origin: string, problems: BootProblem[]): Promise<Page> => {
  const socket = new WebSocket(url)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error('the browser refused its DevTools connection')), { once: true })
  })
  let nextId = 1
  const pending = new Map<number, Pending>()
  const send: Send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  let finishLoad: () => void = () => undefined
  const loaded = new Promise<void>((resolve) => { finishLoad = resolve })
  const onEvent = pageProblems(origin, send, problems, () => finishLoad())
  socket.addEventListener('message', (event) => {
    const parsed = envelopeSchema.safeParse(JSON.parse(String(event.data)))
    if (!parsed.success) return
    const message = parsed.data
    if (message.id === undefined) { onEvent(message.method, message.params ?? {}); return }
    const waiting = pending.get(message.id)
    pending.delete(message.id)
    if (waiting) message.error ? waiting.reject(new Error(message.error.message)) : waiting.resolve(message.result)
  })
  return { send, close: () => socket.close(), loaded }
}
