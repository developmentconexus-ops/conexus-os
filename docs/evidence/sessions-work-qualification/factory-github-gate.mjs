// Walks the real Factory composition, with the real GithubIntegration class, as far as it
// goes without a GitHub App, and records exactly where it stops. It builds nothing fake:
// the class under test is the published one, and the credentials are placeholders, which is
// precisely why every step past construction has to refuse.
//
// Its purpose is to pin the external gate to a line rather than to a belief. A run that got
// further than the gate would mean the gate is not where this report says it is.
//
// Throwaway and isolated. Scratch LibSQL file, no network, no credentials, no paid call.
// Usage: node factory-github-gate.mjs [--negative-control]
// Run it from the scratch directory factory-compat.sh printed.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { MastraFactory } from '@mastra/factory'
import { GithubIntegration } from '@mastra/factory/integrations/github/integration'
import { Mastra } from '@mastra/core/mastra'
import { LocalSandbox } from '@mastra/core/workspace'
import { LibSQLFactoryStorage } from '@mastra/libsql'

const negativeControl = process.argv.includes('--negative-control')
const dir = mkdtempSync(resolve(tmpdir(), 'factory-gate-'))

const results = []
const claim = (property, statement, ok, detail = '') => results.push({ property, statement, ok, detail })
const refusal = async (attempt) => {
  try { return { refused: false, detail: `completed: ${String(await attempt()).slice(0, 120)}` } }
  catch (error) { return { refused: true, detail: error?.message ?? String(error) } }
}

const incomplete = await refusal(async () => new GithubIntegration({ appId: '1', slug: 'probe' }))
claim('credentials', 'the published integration refuses partial GitHub App credentials',
  incomplete.refused && /missing required config field/.test(incomplete.detail), incomplete.detail)

// A structurally complete but meaningless credential set. It proves the wiring reaches
// GitHub, and nothing about GitHub itself.
const github = new GithubIntegration({
  appId: '0', privateKey: 'placeholder', clientId: 'placeholder',
  clientSecret: 'placeholder', slug: 'conexus-factory-integration-probe',
})
claim('composition', 'the real integration class constructs with a complete credential set',
  github?.id === 'github', `id ${github?.id}`)

// A storage instance carries the domains a prepare() registered on it, so each factory in
// this probe gets its own rather than inheriting the previous one's.
const storageFor = (name) => new LibSQLFactoryStorage({ id: name, url: `file:${resolve(dir, `${name}.db`)}` })

const withoutSecret = await refusal(async () => {
  const factory = new MastraFactory({ storage: storageFor('no-secret'), auth: null, integrations: [github] })
  await factory.prepare()
  return 'prepared'
})
claim('composition', 'registering the GitHub integration without a stable state secret is refused',
  withoutSecret.refused && /state secret/.test(withoutSecret.detail), withoutSecret.detail)

const factory = new MastraFactory({
  storage: storageFor('booted'), auth: null, integrations: [github], stateSecret: 'probe-state-secret',
  sandbox: (ctx) => new LocalSandbox({ id: ctx.sessionId, workingDirectory: join(dir, ctx.sessionId) }),
})
const args = await factory.prepare()
new Mastra(args)
await factory.finalize()
claim('composition', 'the whole Factory boots with the real GitHub integration registered',
  Object.keys(args.agentControllers ?? {}).length === 1 && (args.server?.apiRoutes?.length ?? 0) > 0,
  `${Object.keys(args.agentControllers ?? {}).join(', ')}, ${args.server?.apiRoutes?.length ?? 0} routes`)

const gate = await refusal(() => github.versionControl.getRepositoryAccess({
  orgId: 'org-probe', repositoryId: 'repository-that-was-never-registered',
}))
claim('the gate', 'resolving repository access stops without a real App installation',
  gate.refused, gate.detail)

await factory.shutdown()

if (negativeControl) {
  claim('negative control', 'repository access resolved without an installation', !gate.refused,
    'this claim is false on purpose')
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${r.property}] ${r.statement}${r.detail ? `  (${r.detail})` : ''}`)
process.exit(results.some((r) => !r.ok) ? 1 : 0)
