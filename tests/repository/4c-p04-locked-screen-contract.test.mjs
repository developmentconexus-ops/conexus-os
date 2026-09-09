import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = value => resolve(root, value)
const read = value => readFileSync(path(value), 'utf8')
const requireText = (text, needle, message = needle) => {
  if (!text.includes(needle)) throw new Error(`P-04 lock missing: ${message}`)
}
function gitBlobSha(text) {
  const bytes = Buffer.from(text.replaceAll('\r\n', '\n'), 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

test('operator-approved P-04 artifact remains pinned and closed through P9/P10', () => {
  const htmlPath = 'docs/evidence/4c/p04-release-operations-functional-wireframe.html'
  const contractPath = 'docs/evidence/4c/p04-release-operations-screen-contract.md'
  const blob = '9aaa2c8e6d85b7b5d535bfba5969c475190ba7e7'
  const family3Locked = '77820d283e47ba6c9f5efd19f45471c88675e0b0'
  const family4Candidate = 'e036684e3e66d028361db2d708cf05811a367f4b'

  if (!existsSync(path(contractPath))) throw new Error('P-04 exact Screen Contract must exist after operator lock')

  const html = read(htmlPath)
  const contract = read(contractPath)
  const evidence = read('docs/evidence/4c/p04-release-operations-authority-feasibility-and-structural-hypotheses.md')
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')

  if (gitBlobSha(html) !== family4Candidate) throw new Error('P12 Family 4 re-locked P-04 drifted')

  for (const token of [
    'LOCKED / OPERATOR APPROVED', 'P9 EXACT TRACE CLOSED', 'P10 CONSOLIDATED', 'P11 LATER ASSEMBLED PRODUCT',
    `approved final P8 artifact blob = ${blob}`,
    `approved serving-egress P8 delta blob = ${family3Locked} / OPERATOR APPROVED 2026-08-28`,
    `approved originatingRun-ingress P8 delta blob = ${family4Candidate} / OPERATOR APPROVED 2026-08-28`,
    'Releases / Serving now', 'Immutable Releases', 'Promotion history/detail', 'Activity / Timeline',
    'Managed jobs', 'Effects', 'Usage & cost', 'Audit',
    'REL-07 GetProjectServingState', 'REL-01 ListReleases', 'REL-02 GetRelease',
    'REL-04 ListPromotions', 'REL-05 GetPromotion', 'REL-06 PromoteRelease', 'REL-08 GetEnvironmentConformance',
    'OBS-01 ListProjectActivity', 'OBS-02 GetExecutionObservationDetail', 'OBS-03 GetProjectUsageCostSummary',
    'OBS-04 ListAuditRecords', 'OBS-05 GetAuditRecord',
    'MAR-04 ListRunnableManagedJobs', 'MAR-01 ListManagedJobRuns', 'MAR-02 GetManagedJobRun', 'MAR-03 RunManagedJobNow',
    'GW-01 ListEffectAttempts', 'GW-02 GetEffectAttempt',
    'SERVER', 'URL_NAVIGATION', 'EPHEMERAL_UI',
    'P-05 / PA-01 / BUD-01 / P11 / 4D / Product implementation = NOT AUTHORIZED',
  ]) requireText(contract, token)

  requireText(evidence, '## 11. Operator LOCK closure', 'decision/Evidence closure')
  requireText(evidence, `approved final P8 artifact blob = ${blob}`, 'decision/Evidence exact artifact')
  requireText(inventory, 'Family 3 preserved; P12 Family 4 originatingRun `e036684e...` / RE-LOCKED / OPERATOR APPROVED', 'inventory exact P-04 re-lock')
})
