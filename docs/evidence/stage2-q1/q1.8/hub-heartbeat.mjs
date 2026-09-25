// One Hub heartbeat as the pilot's test operator, through a browser session like the product's own:
// IAM (access context), Workspace (list and read), Project (list), and one real write to the Hub
// PostgreSQL read back (the operator's personal model defaults, swapped and then restored).
// Prints one JSON line. Usage: CONEXUS_STATE=<storage state> node hub-heartbeat.mjs <label>
import { chromium } from '@playwright/test'

const base = 'https://hub.conexus.localhost:3443'
const label = process.argv[2] ?? 'heartbeat'
const browser = await chromium.launch({ headless: true })
const report = { label, at: new Date().toISOString(), steps: [] }
try {
  const context = await browser.newContext({ storageState: process.env.CONEXUS_STATE })
  const page = await context.newPage()
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  const call = (method, path, body) => page.evaluate(async ([m, p, b]) => {
    const started = performance.now()
    // A mutation carries the session's CSRF cookie back as a header, as the Hub's own client does.
    const csrf = document.cookie.split('; ').find((entry) => entry.startsWith('__Host-conexus_csrf='))?.split('=')[1]
    const headers = { ...(b ? { 'content-type': 'application/json' } : {}), ...(m !== 'GET' && csrf ? { 'x-conexus-csrf': csrf } : {}) }
    const response = await fetch(p, { method: m, credentials: 'same-origin', headers, body: b ? JSON.stringify(b) : undefined })
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { status: response.status, ms: Math.round(performance.now() - started), json }
  }, [method, path, body])
  const step = async (name, method, path, body) => {
    const result = await call(method, path, body)
    report.steps.push({ name, method, path, status: result.status, ms: result.ms })
    return result
  }
  const access = await step('IAM access context', 'GET', '/api/control/access-context')
  const workspaceId = access.json?.workspaces?.[0]?.workspaceId
  await step('Workspace read', 'GET', `/api/control/workspaces/${workspaceId}`)
  const projects = await step('Project list', 'GET', `/api/control/workspaces/${workspaceId}/projects`)
  report.projectCount = Array.isArray(projects.json) ? projects.json.length : projects.json?.projects?.length ?? null
  const before = await step('model defaults read', 'GET', '/api/control/model-defaults')
  const original = before.json?.mine ?? null
  const seed = original ?? before.json?.installation
  if (!seed) throw new Error('NO_MODEL_DEFAULTS_TO_SWAP')
  const written = { build: seed.fast, fast: seed.build }
  await step('model defaults write', 'PUT', '/api/control/model-defaults/mine', written)
  const readBack = await step('model defaults read-back', 'GET', '/api/control/model-defaults')
  report.readBackMatches = JSON.stringify(readBack.json?.mine) === JSON.stringify(written)
  if (original) await step('model defaults restore', 'PUT', '/api/control/model-defaults/mine', original)
  else await step('model defaults restore', 'DELETE', '/api/control/model-defaults/mine')
  const restored = await step('model defaults after restore', 'GET', '/api/control/model-defaults')
  report.restored = JSON.stringify(restored.json?.mine ?? null) === JSON.stringify(original)
  report.ok = report.steps.every((entry) => entry.status >= 200 && entry.status < 300) && report.readBackMatches && report.restored
} catch (error) {
  report.ok = false
  report.error = String(error?.message ?? error).slice(0, 300)
} finally {
  await browser.close()
}
process.stdout.write(`${JSON.stringify(report)}\n`)
if (!report.ok) process.exitCode = 1
