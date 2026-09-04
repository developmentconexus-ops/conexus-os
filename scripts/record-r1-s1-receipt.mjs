import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sha256, verifyBootstrap } from './check-r1-a0-bootstrap.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const manifestPath = resolve(repositoryRoot, 'runtime/r1/.conexus/s1-ownership-manifest.json')
const receiptPath = resolve(repositoryRoot, 'runtime/r1/.conexus/s1-generation-receipt.json')

if (!process.argv.includes('--check')) throw new Error('S1_HISTORICAL_RECEIPT_WRITE_REFUSED')

const verified = verifyBootstrap({ requireBaseline: false, verifyPriorTooling: false, requireValidation: true })
const manifestBytes = readFileSync(manifestPath)
const receiptBytes = readFileSync(receiptPath)
if (sha256(manifestBytes) !== verified.plan.prior.s1ManifestDigest) throw new Error('S1_HISTORICAL_MANIFEST_DRIFT')
if (sha256(receiptBytes) !== verified.plan.prior.s1ReceiptDigest) throw new Error('S1_HISTORICAL_RECEIPT_DRIFT')
const receipt = JSON.parse(receiptBytes.toString('utf8'))

process.stdout.write(`${JSON.stringify({
  ...receipt,
  transitionPlanDigest: verified.planDigest,
  transitionValidationDigest: verified.validationDigest,
  verdict: 'TRANSITION_PASS',
})}\n`)
