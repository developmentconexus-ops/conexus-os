// Throwaway Factory boot probe. Runs only inside /tmp/factory-compat, never in the product.
// No auth provider, no integrations, no sandbox, no model call.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { MastraFactory, workBoard, reviewBoard } from '@mastra/factory'
import { LibSQLFactoryStorage } from '@mastra/libsql'

const dir = mkdtempSync(resolve(tmpdir(), 'factory-boot-'))
const storage = new LibSQLFactoryStorage({ id: 'probe', url: `file:${resolve(dir, 'factory.db')}` })

const out = []
try {
  const factory = new MastraFactory({ storage, auth: null })
  out.push(`constructed MastraFactory with auth disabled and a LibSQL factory storage`)
  out.push(`board ids shipped: ${[workBoard, reviewBoard].map((b) => b?.id ?? b?.definition?.id ?? '?').join(', ')}`)
  const args = await factory.prepare()
  out.push(`prepare() returned Mastra args with keys: ${Object.keys(args).sort().join(', ')}`)
  out.push(`agentControllers: ${Object.keys(args.agentControllers ?? {}).join(', ') || 'none'}`)
  out.push(`agents: ${Object.keys(args.agents ?? {}).join(', ') || 'none'}`)
  out.push(`apiRoutes declared: ${args.server?.apiRoutes?.length ?? 0}`)
} catch (error) {
  out.push(`prepare() failed: ${error?.message ?? error}`)
  if (process.env.TRACE) console.error(error)
}
console.log(out.join('\n'))
process.exit(0)
