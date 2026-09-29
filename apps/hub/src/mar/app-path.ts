export const SERVER_ROOT = 'conexus-server/'
const PLATFORM_ROOT = '__conexus'
const ENTRY_PATH = 'index.html'
const SERVABLE_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

export type AppPath =
  | Readonly<{ kind: 'file'; path: string }>
  | Readonly<{ kind: 'app-shell' }>
  | Readonly<{ kind: 'not-found' }>

const NOT_FOUND: AppPath = { kind: 'not-found' }
const APP_SHELL: AppPath = { kind: 'app-shell' }

const decodedSegments = (pathname: string): string[] | null => {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname.slice(1))
  } catch {
    return null
  }
  if ([...decoded].some((char) => char === '\\' || char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) return null
  const segments = (decoded.endsWith('/') ? decoded.slice(0, -1) : decoded).split('/')
  return segments.some((segment) => segment === '' || segment === '.' || segment === '..') ? null : segments
}

/**
 * The one answer to "what does this request for an app path get": a declared file, the app's
 * index.html for a client route, or 404. The Prévia, the app host and the boot server share it.
 * `isDeclared` says whether a decoded relative path is a file of the app.
 */
export const classifyAppPath = (method: string, pathname: string, isDeclared: (path: string) => boolean): AppPath => {
  if ((method !== 'GET' && method !== 'HEAD') || !pathname.startsWith('/')) return NOT_FOUND
  if (pathname === '/') return { kind: 'file', path: ENTRY_PATH }
  const segments = decodedSegments(pathname)
  if (!segments) return NOT_FOUND
  const path = segments.join('/')
  if (`${path}/`.startsWith(SERVER_ROOT) || segments[0] === PLATFORM_ROOT) return NOT_FOUND
  if (SERVABLE_PATH.test(path) && isDeclared(path)) return { kind: 'file', path }
  return segments[segments.length - 1]?.includes('.') ? NOT_FOUND : APP_SHELL
}

/**
 * The classifier as source text for the check script, which runs in the sandbox and cannot import
 * from the Hub. It carries the same constants and helpers by name, so the boot server answers what
 * the Prévia and the app host answer.
 */
export const appPathClassifierSource = [
  `const SERVER_ROOT = ${JSON.stringify(SERVER_ROOT)}`,
  `const PLATFORM_ROOT = ${JSON.stringify(PLATFORM_ROOT)}`,
  `const ENTRY_PATH = ${JSON.stringify(ENTRY_PATH)}`,
  `const SERVABLE_PATH = ${SERVABLE_PATH.toString()}`,
  `const NOT_FOUND = ${JSON.stringify(NOT_FOUND)}`,
  `const APP_SHELL = ${JSON.stringify(APP_SHELL)}`,
  `const decodedSegments = ${decodedSegments.toString()}`,
  `const classifyAppPath = ${classifyAppPath.toString()}`,
].join('\n')
