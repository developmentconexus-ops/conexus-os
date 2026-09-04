import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  admitJsonBytes,
  applyGenerationPlan,
  canonicalBytes,
  compileProfile,
  createValidator,
  planGeneration,
  recordGenerationAttempt,
  sha256,
} from '../packages/profile-compiler/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const profilePath = resolve(repositoryRoot, 'profiles/r1/v1/profile.json')
const inputPath = resolve(repositoryRoot, 'profiles/r1/v1/input-set.json')
const profileSchema = JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/profile-compiler/schemas/profile.schema.json'), 'utf8'))
const inputSchema = JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/profile-compiler/schemas/input-set.schema.json'), 'utf8'))
const profileAdmission = admitJsonBytes(readFileSync(profilePath), createValidator(profileSchema))
const inputAdmission = admitJsonBytes(readFileSync(inputPath), createValidator(inputSchema))
const wire = inputAdmission.value.wireProjection
const wireBody = { kind: wire.kind, sourceRefs: wire.sourceRefs, operations: wire.operations }

if (sha256(canonicalBytes(wireBody)) !== wire.digest) throw new Error('R1 wire projection digest mismatch')
for (const source of wire.sourceRefs) {
  const observed = sha256(readFileSync(resolve(repositoryRoot, source.path)))
  if (observed !== source.sha256) throw new Error(`stale R1 source ${source.path}`)
}

const compiled = compileProfile({ profileAdmission, inputAdmission })
const root = resolve(repositoryRoot, 'runtime/r1')
let plan
try {
  plan = planGeneration({ root, compiled })
  const result = applyGenerationPlan({ root, compiled, plan })
  process.stdout.write(`${JSON.stringify({
    kind: 'conexus.r1-g0-generation-result/v1',
    profileDigest: compiled.profileDigest,
    inputDigest: compiled.inputDigest,
    wireDigest: wire.digest,
    operationCensus: wire.operations.length,
    manifestDigest: compiled.manifestDigest,
    treeDigest: compiled.treeDigest,
    planDigest: plan.planDigest,
    receiptDigest: result.receiptDigest,
    writes: result.writes,
    verdict: 'PASS',
  }, null, 2)}\n`)
} catch (error) {
  recordGenerationAttempt({ root, plan, error })
  throw error
}
