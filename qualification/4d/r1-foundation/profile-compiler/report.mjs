import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { admitJsonBytes, canonicalBytes, createValidator, sha256 } from './admission.mjs'
import { applyGenerationPlan, compileFixture, planGeneration } from './compiler.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const profileBytes = readFileSync(resolve(here, 'fixtures/profile.json'))
const inputBytes = readFileSync(resolve(here, 'fixtures/input.json'))
const validateProfile = createValidator(JSON.parse(readFileSync(resolve(here, 'profile.schema.json'))))
const validateInput = createValidator(JSON.parse(readFileSync(resolve(here, 'input.schema.json'))))
const profileAdmission = admitJsonBytes(profileBytes, validateProfile)
const inputAdmission = admitJsonBytes(inputBytes, validateInput)
const compiled = compileFixture({ profileAdmission, inputAdmission })
const root = mkdtempSync(resolve(tmpdir(), 'conexus-r1f-pack-b-report-'))

try {
  const plan = planGeneration({ root, compiled })
  const applied = applyGenerationPlan({ root, compiled, plan })
  const rfcSample = {
    numbers: [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],
    string: "€$\u000f\nA'B\"\\\\\"/",
    literals: [null, true, false],
  }
  process.stdout.write(`${JSON.stringify({
    kind: 'conexus.r1f.pack-b-observation/v1',
    profileDigest: profileAdmission.digest,
    inputDigest: inputAdmission.digest,
    canonicalInputSetDigest: compiled.canonicalInputSetDigest,
    manifestDigest: compiled.manifestDigest,
    treeDigest: compiled.treeDigest,
    planDigest: plan.planDigest,
    receiptDigest: applied.receiptDigest,
    entryCount: compiled.entries.length,
    operationCounts: Object.fromEntries([...new Set(plan.operations.map(operation => operation.action))].sort().map(action => [action, plan.operations.filter(operation => operation.action === action).length])),
    rfc8785VectorSha256: sha256(canonicalBytes(rfcSample)),
    verdict: 'PASS',
  }, null, 2)}\n`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
