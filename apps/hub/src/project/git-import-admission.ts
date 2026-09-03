import { isIP } from 'node:net'

const ENTRY_ID = /^[a-z][a-z0-9-]{0,62}$/
const SLOT = /^[a-z][a-z0-9-]{0,62}$/
const NETWORK = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const REF = /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,190}$/

export type GitImportTlsPolicy = Readonly<
  | { mode: 'SYSTEM' }
  | { mode: 'EXTERNAL_CA_FILE'; caFileSlot: string }
>

export type GitImportAdmissionEntry = Readonly<{
  id: string
  host: string
  port: number
  pathPrefix: string
  defaultRef: string
  tls: GitImportTlsPolicy
  credentialSlot?: string
  networkName: string
  timeoutMs: number
  maxFetchedBytes: number
  maxObjectCount: number
  enabled: boolean
}>

export type GitImportAdmissionCatalog = Readonly<{ entries: readonly GitImportAdmissionEntry[] }>

export type GitImportAdmission = Readonly<
  | { status: 'ADMITTED'; canonicalLocator: string; entry: GitImportAdmissionEntry }
  | { status: 'REFUSED'; code: 'CATALOG_REFUSED' | 'LOCATOR_REFUSED' | 'DESTINATION_NOT_ADMITTED' }
>

const constructedCatalogs = new WeakSet<object>()

function canonicalPathPrefix(value: string): boolean {
  return value.startsWith('/') && value.endsWith('/') && value !== '/' &&
    !value.includes('//') && !value.includes('\\') && !/%(?:2e|2f|5c)/i.test(value) &&
    !value.split('/').some((part) => part === '.' || part === '..')
}

function validEntry(entry: GitImportAdmissionEntry): boolean {
  return ENTRY_ID.test(entry.id) && HOST.test(entry.host) && entry.host === entry.host.toLowerCase() &&
    !entry.host.endsWith('.') && isIP(entry.host) === 0 && Number.isInteger(entry.port) &&
    entry.port >= 1 && entry.port <= 65_535 && canonicalPathPrefix(entry.pathPrefix) &&
    REF.test(entry.defaultRef) && !entry.defaultRef.includes('..') &&
    (entry.tls.mode === 'SYSTEM' || (entry.tls.mode === 'EXTERNAL_CA_FILE' && SLOT.test(entry.tls.caFileSlot))) &&
    (entry.credentialSlot === undefined || SLOT.test(entry.credentialSlot)) &&
    NETWORK.test(entry.networkName) && entry.networkName !== 'host' && entry.networkName !== 'none' &&
    Number.isInteger(entry.timeoutMs) && entry.timeoutMs >= 1_000 && entry.timeoutMs <= 60_000 &&
    Number.isInteger(entry.maxFetchedBytes) && entry.maxFetchedBytes >= 1 && entry.maxFetchedBytes <= 1_073_741_824 &&
    Number.isInteger(entry.maxObjectCount) && entry.maxObjectCount >= 1 && entry.maxObjectCount <= 1_000_000 &&
    typeof entry.enabled === 'boolean'
}

export function createGitImportAdmissionCatalog(
  entries: readonly GitImportAdmissionEntry[],
): GitImportAdmissionCatalog | null {
  if (entries.length === 0 || entries.some((entry) => !validEntry(entry))) return null
  const ids = new Set<string>()
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (!entry || ids.has(entry.id)) return null
    ids.add(entry.id)
    for (const other of entries.slice(index + 1)) {
      if (entry.host === other.host && entry.port === other.port &&
        (entry.pathPrefix.startsWith(other.pathPrefix) || other.pathPrefix.startsWith(entry.pathPrefix))) return null
    }
  }
  const catalog = Object.freeze({ entries: Object.freeze(entries.map((entry) => Object.freeze({
    ...entry,
    tls: Object.freeze({ ...entry.tls }),
  }))) })
  constructedCatalogs.add(catalog)
  return catalog
}

export function admitGitImportLocator(
  catalog: GitImportAdmissionCatalog,
  locator: string,
): GitImportAdmission {
  if (!constructedCatalogs.has(catalog)) return Object.freeze({ status: 'REFUSED', code: 'CATALOG_REFUSED' })
  let url: URL
  try {
    url = new URL(locator)
  } catch {
    return Object.freeze({ status: 'REFUSED', code: 'LOCATOR_REFUSED' })
  }
  const port = url.port === '' ? 443 : Number(url.port)
  const canonical = `https://${url.hostname}${port === 443 ? '' : `:${port}`}${url.pathname}`
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' ||
    url.hostname !== url.hostname.toLowerCase() || url.hostname.endsWith('.') || isIP(url.hostname) !== 0 ||
    !HOST.test(url.hostname) || !Number.isInteger(port) || locator !== canonical ||
    !url.pathname.startsWith('/') || url.pathname.includes('//') || url.pathname.includes('\\') ||
    /%(?:2e|2f|5c)/i.test(url.pathname) || url.pathname.split('/').some((part) => part === '.' || part === '..')) {
    return Object.freeze({ status: 'REFUSED', code: 'LOCATOR_REFUSED' })
  }
  const matched = catalog.entries.filter((entry) => entry.enabled && entry.host === url.hostname &&
    entry.port === port && url.pathname.startsWith(entry.pathPrefix) && url.pathname.length > entry.pathPrefix.length)
  if (matched.length !== 1 || !matched[0]) {
    return Object.freeze({ status: 'REFUSED', code: 'DESTINATION_NOT_ADMITTED' })
  }
  return Object.freeze({ status: 'ADMITTED', canonicalLocator: canonical, entry: matched[0] })
}
