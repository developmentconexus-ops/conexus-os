import { createHash, randomBytes } from 'node:crypto'

const ENTRY_MS = 30_000
const COOKIE_MS = 15 * 60 * 1000
const MAX_RECORDS = 4_096
const SWEEP_MS = 30_000

type SessionReader = (input: Readonly<{ sessionDigest: Uint8Array; now: Date }>) => Promise<Readonly<{
  account: Readonly<{ accountId: string }>
  issuer: string
  subject: string
}> | null>

export type PreviewRouteBinding = Readonly<{
  routeId: string
  generation: string
  attemptId: string
  accountId: string
  projectId: string
  changeId: string
  subjectDigest: string
  sourceRevision: string
  artifactRevisionId: string
  artifactDigest: string
  exactHost: string
  expiresAt: number
}>

export type PreviewCookieBinding = PreviewRouteBinding & Readonly<{
  issuer: string
  subject: string
}>

export type PreviewAccess = Readonly<{
  issueEntryGrant(input: Readonly<{
    sessionToken: string
    route: PreviewRouteBinding
    now?: Date
  }>): Promise<Readonly<{ entryGrant: string; expiresAt: number }>>
  consumeEntryGrant(input: Readonly<{
    entryGrant: string
    exactHost: string
    now?: Date
  }>): Promise<Readonly<{ cookie: string; binding: PreviewCookieBinding }> | null>
  resolvePreviewCookie(input: Readonly<{
    cookie: string
    exactHost: string
    now?: Date
  }>): Promise<PreviewCookieBinding | null>
  discardEntryGrant(entryGrant: string): void
  discardCookie(cookie: string): void
  close(): Promise<void>
}>

type EntryRecord = Readonly<{
  sessionDigest: Buffer
  route: PreviewRouteBinding
  expiresAt: number
  issuer: string
  subject: string
}>

type CookieRecord = Readonly<{
  sessionDigest: Buffer
  route: PreviewRouteBinding
  expiresAt: number
  issuer: string
  subject: string
}>

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest()
const secret = (): string => randomBytes(32).toString('base64url')

const validRoute = (route: PreviewRouteBinding): void => {
  if (!route.routeId || !route.generation || !route.attemptId || !route.accountId ||
    !route.projectId || !route.changeId || !route.subjectDigest || !route.sourceRevision ||
    !route.artifactRevisionId || !route.artifactDigest || !route.exactHost ||
    !Number.isSafeInteger(route.expiresAt)) throw new Error('PREVIEW_ROUTE_REFUSED')
}

export const createPreviewAccess = ({
  readSession,
  now = () => Date.now(),
}: Readonly<{
  readSession: SessionReader
  now?: () => number
}>): PreviewAccess => {
  const entries = new Map<string, EntryRecord>()
  const cookies = new Map<string, CookieRecord>()
  const pendingReads = new Set<Promise<unknown>>()
  let closed = false
  let closing: Promise<void> | null = null
  const sweeper = setInterval(() => {
    const current = now()
    for (const [key, record] of entries) if (record.expiresAt <= current) entries.delete(key)
    for (const [key, record] of cookies) if (record.expiresAt <= current) cookies.delete(key)
  }, SWEEP_MS)
  sweeper.unref?.()

  const expire = (current: number): void => {
    for (const [key, record] of entries) if (record.expiresAt <= current) entries.delete(key)
    for (const [key, record] of cookies) if (record.expiresAt <= current) cookies.delete(key)
  }
  const capacityAvailable = (current: number): boolean => {
    expire(current)
    return entries.size + cookies.size < MAX_RECORDS
  }
  const readCurrentSession = async (input: Readonly<{ sessionDigest: Uint8Array; now: Date }>) => {
    const pending = readSession(input)
    pendingReads.add(pending)
    try { return await pending } finally { pendingReads.delete(pending) }
  }
  const issueEntryGrant = async ({ sessionToken, route, now: suppliedNow }: Readonly<{
    sessionToken: string
    route: PreviewRouteBinding
    now?: Date
  }>): Promise<Readonly<{ entryGrant: string; expiresAt: number }>> => {
    if (closed) throw new Error('PREVIEW_ACCESS_CLOSED')
    validRoute(route)
    const current = suppliedNow?.getTime() ?? now()
    const snapshot = Object.freeze({ ...route })
    if (!sessionToken || snapshot.expiresAt <= current || !capacityAvailable(current)) throw new Error('PREVIEW_ACCESS_UNAVAILABLE')
    const sessionDigest = sha256(sessionToken)
    const session = await readCurrentSession({ sessionDigest, now: new Date(current) })
    const issuedAt = now()
    if (closed || !session || session.account.accountId !== snapshot.accountId || snapshot.expiresAt <= issuedAt || !capacityAvailable(issuedAt)) {
      throw new Error('PREVIEW_ACCESS_UNAVAILABLE')
    }
    const entryGrant = secret()
    const expiresAt = Math.min(issuedAt + ENTRY_MS, snapshot.expiresAt)
    entries.set(sha256(entryGrant).toString('hex'), Object.freeze({
      sessionDigest,
      route: snapshot,
      expiresAt,
      issuer: session.issuer,
      subject: session.subject,
    }))
    return Object.freeze({ entryGrant, expiresAt })
  }

  const consumeEntryGrant = async ({ entryGrant, exactHost, now: suppliedNow }: Readonly<{
    entryGrant: string
    exactHost: string
    now?: Date
  }>): Promise<Readonly<{ cookie: string; binding: PreviewCookieBinding }> | null> => {
    if (closed || !entryGrant || !exactHost) return null
    const key = sha256(entryGrant).toString('hex')
    const record = entries.get(key)
    if (!record) return null
    entries.delete(key)
    const current = suppliedNow?.getTime() ?? now()
    if (record.expiresAt <= current || record.route.exactHost !== exactHost || closed) return null
    const session = await readCurrentSession({ sessionDigest: record.sessionDigest, now: new Date(current) })
    if (closed || record.expiresAt <= now() || !session || session.account.accountId !== record.route.accountId ||
      session.issuer !== record.issuer || session.subject !== record.subject) return null
    if (!capacityAvailable(now())) return null
    const cookie = secret()
    const expiresAt = Math.min(current + COOKIE_MS, record.route.expiresAt)
    const cookieRecord: CookieRecord = Object.freeze({
      sessionDigest: record.sessionDigest,
      route: Object.freeze({ ...record.route, expiresAt }),
      expiresAt,
      issuer: session.issuer,
      subject: session.subject,
    })
    cookies.set(sha256(cookie).toString('hex'), cookieRecord)
    return Object.freeze({
      cookie,
      binding: Object.freeze({ ...cookieRecord.route, issuer: session.issuer, subject: session.subject }),
    })
  }

  const resolvePreviewCookie = async ({ cookie, exactHost, now: suppliedNow }: Readonly<{
    cookie: string
    exactHost: string
    now?: Date
  }>): Promise<PreviewCookieBinding | null> => {
    if (closed || !cookie || !exactHost) return null
    const key = sha256(cookie).toString('hex')
    const record = cookies.get(key)
    if (!record) return null
    const current = suppliedNow?.getTime() ?? now()
    if (record.expiresAt <= current || record.route.exactHost !== exactHost) return null
    const session = await readCurrentSession({ sessionDigest: record.sessionDigest, now: new Date(current) })
    const currentRecord = cookies.get(key)
    if (closed || currentRecord !== record || record.expiresAt <= now() ||
      !session || session.account.accountId !== record.route.accountId ||
      session.issuer !== record.issuer || session.subject !== record.subject) return null
    return Object.freeze({ ...record.route, issuer: session.issuer, subject: session.subject })
  }

  const discardEntryGrant = (entryGrant: string): void => {
    if (entryGrant) entries.delete(sha256(entryGrant).toString('hex'))
  }

  const discardCookie = (cookie: string): void => {
    if (cookie) cookies.delete(sha256(cookie).toString('hex'))
  }

  const close = async (): Promise<void> => {
    if (closing !== null) return closing
    if (closed) return
    closed = true
    clearInterval(sweeper)
    closing = Promise.resolve().then(() => {
      entries.clear()
      cookies.clear()
    }).then(async () => { await Promise.allSettled([...pendingReads]) })
    await closing
  }

  return Object.freeze({ issueEntryGrant, consumeEntryGrant, resolvePreviewCookie, discardEntryGrant, discardCookie, close })
}
