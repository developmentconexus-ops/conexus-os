import { createHash } from 'node:crypto'
import { hubModuleUrl } from '../hub-build.mjs'

const { createHttpApp } = await import(hubModuleUrl('http/app.js'))

export const HUB_ORIGIN = 'https://hub.conexus.test'

export const opaque = (label) => createHash('sha256').update(label).digest('base64url')

export const hubSessionCookie = (token) => `__Host-conexus_session=${token}`

export const hubWrite = Object.freeze({ origin: HUB_ORIGIN, 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' })
export const hubJsonWrite = Object.freeze({ ...hubWrite, 'content-type': 'application/json' })

export const testListener = async ({ policy, sessions = {}, registerRoutes = async () => [], staticRoot = null, hubOrigin = HUB_ORIGIN, previewCspSource } = {}) => {
  const byDigest = new Map(Object.entries(sessions).map(([token, session]) => [createHash('sha256').update(token).digest('hex'), session]))
  const resolved = []
  const hubPolicy = {
    listener: 'hub',
    hubOrigin,
    ...(previewCspSource ? { previewCspSource } : {}),
    resolveHubSession: async (digest) => {
      resolved.push(digest.toString('hex'))
      const session = byDigest.get(digest.toString('hex'))
      return typeof session === 'function' ? session() : session ?? null
    },
  }
  const app = await createHttpApp({ policy: policy ?? hubPolicy, registerRoutes, staticRoot })
  return { app, resolved }
}
