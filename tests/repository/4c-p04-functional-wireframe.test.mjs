import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(new URL('../../', import.meta.url).pathname)
const html = readFileSync(resolve(root, 'docs/evidence/4c/p04-release-operations-functional-wireframe.html'), 'utf8')

const requireText = (needle, message = needle) => {
  if (!html.includes(needle)) throw new Error(`P-04 functional wireframe missing ${message}`)
}

test('P-04 preserves direct Releases and Activity routes with owner-specific lenses', () => {
  for (const token of [
    'data-wireframe="p-04"',
    'data-route="releases"',
    'data-route="activity"',
    'Serving now',
    'Immutable Releases',
    'Promotion history',
    'data-activity="timeline"',
    'data-activity="jobs"',
    'data-activity="effects"',
    'data-activity="usage"',
    'data-activity="audit"',
    'Activity != owner lifecycle truth',
  ]) requireText(token)
})

test('Release interaction keeps pointer, serving verification, composition and Promotion truth distinct', () => {
  for (const token of [
    'pointerState',
    'pointerGeneration',
    'servingVerification',
    'SERVED_VERIFIED',
    'Verification pending',
    'Overview',
    'Composition',
    'Proof',
    'expected pointer generation',
    'STALE_PROMOTION',
    'PROMOTION_DENIED',
    'Promotion admitted. Pointer updated; serving verification remains pending.',
    'rollback = Promote prior exact Release',
  ]) requireText(token)
  if (/\brollback now\b/i.test(html)) throw new Error('P-04 must not invent a distinct rollback mutation')
})

test('Activity lenses expose exact owner work and preserve negative authority laws', () => {
  for (const token of [
    'Inspect observation',
    'Producer trust',
    'Trace correlation',
    'Correlation only.',
    'Currently served Release catalog subject',
    'This admitted job has never run',
    'Release-pinned',
    'data-job-run=',
    'Pinned Release',
    'JobRun owner truth is not queue delivery state.',
    'JOB_CONFLICT',
    'JOB_DENIED',
    'No retry control exists here.',
    'OUTCOME_UNKNOWN -X-&gt; retry',
    'missing usage/cost != zero',
    'exact server filter before pagination',
    'Actor snapshot',
    'Subject snapshot',
  ]) requireText(token)
})

test('revised P-04 exposes owner-supported cost provenance and Promotion detail', () => {
  for (const token of [
    'Input tokens',
    'Output tokens',
    'Cache tokens',
    'Reasoning tokens',
    'Calculated model cost',
    'Provider-reported cost',
    'Reconciled cost',
    'Sandbox/runtime cost',
    'evidence://usage-period/provider',
    'data-promotion=',
    'Expected generation',
    'Resulting generation',
    'Promotion failed',
    'Project: Sales Operations',
    'id="audit-from"',
    'id="audit-to"',
  ]) requireText(token)
})

test('material collection and permission states are independently inspectable', () => {
  for (const state of [
    'LOADING',
    'KNOWN_EMPTY',
    'DENIED',
    'DEPENDENCY_FAILURE',
    'UNSET_ENVIRONMENT',
    'STALE_PROMOTION',
    'PROMOTION_DENIED',
    'JOB_CONFLICT',
    'JOB_DENIED',
    'USAGE_MISSING',
    'OUTCOME_UNKNOWN',
  ]) requireText(`<option>${state}</option>`, state)
  requireText('P-04 P8 REVISED CANDIDATE / NOT LOCKED')
  requireText('@media(max-width:760px)')
  requireText('@media(prefers-reduced-motion:reduce)')
  requireText("event.key==='Escape'")
  requireText('aria-live="polite"')
})

test('embedded P-04 walkthrough script parses', () => {
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('P-04 functional wireframe script is absent')
  new Function(match[1])
})
