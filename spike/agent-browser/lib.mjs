import { readFileSync, appendFileSync } from 'node:fs'
import { E2BSandbox } from '@mastra/e2b'
import { Sandbox } from 'e2b'

export const TEMPLATE = '537fnzf4c16x9d7oz21k:449fd9f1-3b61-4c88-9a06-fd61bbfb4060' // CURRENT_TEMPLATE_PIN.templateRef
export const AGENT_USER = 'conexus-agent'
export const apiKey = () => readFileSync(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE, 'utf8').trim()
export const log = (...a) => { const l = new Date().toISOString() + ' ' + a.join(' '); console.log(l); appendFileSync(process.env.SPIKE_LOG ?? '/dev/null', l + '\n') }

// Same options as ConexusRunSandbox / createConversationSandbox (apps/hub/src/builder/sandbox.ts).
export const withSandbox = async (timeoutMs, body) => {
  const sandbox = new E2BSandbox({
    id: 'spike-agent-browser', template: TEMPLATE, apiKey: apiKey(), timeout: timeoutMs,
    network: { allowPublicTraffic: false }, env: {}, workingDirectory: '/workspace',
  })
  const t0 = Date.now()
  let id
  try {
    await sandbox._start()
    await sandbox.e2b.setTimeout(timeoutMs)
    id = sandbox.e2b.sandboxId
    log('SANDBOX_CREATED', id)
    return await body(sandbox.e2b, sandbox)
  } finally {
    try { await sandbox.e2b.kill() } catch (e) { log('KILL_ERR', e.message) }
    try { await sandbox._destroy() } catch {}
    log('SANDBOX_KILLED', id, 'lifetime_s=' + Math.round((Date.now() - t0) / 1000))
  }
}
export const listMine = async () => {
  const out = []
  const p = Sandbox.list({ apiKey: apiKey() })
  while (p.hasNext) for (const s of await p.nextItems()) out.push(s)
  return out
}
