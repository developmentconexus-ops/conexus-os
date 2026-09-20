// Boots the Factory through its whole documented lifecycle, not just prepare(). An earlier
// version of this file stopped at prepare() while claiming the Factory "boots", which was
// more than it showed: prepare() only returns the arguments for `new Mastra(...)`, and
// finalize() is what initializes the controller and starts the background workers.
//
// Throwaway and isolated. Scratch LibSQL file, auth disabled, no integrations, no sandbox,
// no model call, no network, no Mastra platform account.
//
// Usage: node factory-boot.mjs
// Run it from the scratch directory factory-compat.sh printed.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { MastraFactory } from '@mastra/factory'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLFactoryStorage } from '@mastra/libsql'

const dir = mkdtempSync(resolve(tmpdir(), 'factory-boot-'))
const storage = new LibSQLFactoryStorage({ id: 'probe', url: `file:${resolve(dir, 'factory.db')}` })

const results = []
const claim = (property, statement, ok, detail = '') => results.push({ property, statement, ok, detail })

const report = (extra = []) => {
  for (const r of [...results, ...extra]) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${r.property}] ${r.statement}${r.detail ? `  (${r.detail})` : ''}`)
  }
  return [...results, ...extra].some((r) => !r.ok) ? 1 : 0
}

// If the process is still alive well after shutdown(), the Factory left something running
// and the clean-stop claim is false. An unref'd timer cannot itself keep it alive.
const watchdog = setTimeout(() => {
  process.exitCode = report([{ property: 'lifecycle', statement: 'the process exits on its own after shutdown()', ok: false, detail: 'still alive 20s later' }])
  process.exit(process.exitCode)
}, 20_000)
watchdog.unref()

const factory = new MastraFactory({ storage, auth: null })
const args = await factory.prepare()
claim('lifecycle', 'prepare() returns constructor arguments for a Mastra instance',
  Boolean(args?.agentControllers) && Boolean(args?.storage),
  `keys: ${Object.keys(args).sort().join(', ')}`)
claim('composition', 'the Factory mounts its own agent controller',
  Object.keys(args.agentControllers ?? {}).length === 1,
  `controllers: ${Object.keys(args.agentControllers ?? {}).join(', ') || 'none'}`)
claim('composition', 'the Factory brings its own HTTP surface',
  (args.server?.apiRoutes?.length ?? 0) > 0, `${args.server?.apiRoutes?.length ?? 0} api routes`)

const ran = async (attempt) => {
  try { await attempt(); return { ok: true, detail: 'completed' } }
  catch (error) { return { ok: false, detail: `threw ${error?.message ?? error}` } }
}

const mastra = new Mastra(args)
const finalized = await ran(() => factory.finalize())
claim('lifecycle', 'finalize() completes after the Mastra instance is constructed, which is what starts the workers',
  finalized.ok, finalized.detail)

const controllerId = Object.keys(args.agentControllers ?? {})[0]
const controller = mastra.getAgentControllerById?.(controllerId) ?? args.agentControllers?.[controllerId]
claim('composition', 'the mounted controller is reachable from the constructed Mastra instance',
  Boolean(controller), String(controllerId))

const stopped = await ran(() => factory.shutdown())
claim('lifecycle', 'shutdown() stops the Factory-owned background dispatch', stopped.ok, stopped.detail)

clearTimeout(watchdog)
process.exitCode = report()
