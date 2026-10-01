// A case file's `checks` are a short list of Playwright steps run against the Builder's Preview
// iframe. This module owns the shape (what a step is, what counts as a valid one) and the pure
// executor (given something with `.locator()`, run the steps and report what happened) so run.mjs
// stays about orchestrating the Hub and the browser, not about interpreting JSON.
import { expect } from '@playwright/test'

import { ADJUST_LABEL, PLAN_EXPECTATIONS } from './flow.mjs'

const ACTIONS = new Set(['fill', 'click', 'expectText', 'expectNoText'])
const TEXT_ACTIONS = new Set(['expectText', 'expectNoText'])

const fail = (message) => {
  throw new Error(`builder-eval case: ${message}`)
}

const validateStep = (step, index) => {
  if (typeof step !== 'object' || step === null) fail(`checks[${index}] must be an object`)
  const { action, selector, value, text } = step
  if (!ACTIONS.has(action)) fail(`checks[${index}].action must be one of ${[...ACTIONS].join(', ')}, got ${JSON.stringify(action)}`)
  if (typeof selector !== 'string' || !selector.trim()) fail(`checks[${index}].selector must be a non-empty string`)
  if (action === 'fill' && typeof value !== 'string') fail(`checks[${index}].value is required for a fill step`)
  if (TEXT_ACTIONS.has(action) && typeof text !== 'string') fail(`checks[${index}].text is required for an ${action} step`)
  return { action, selector, value: value ?? null, text: text ?? null }
}

/** Parse and validate a case file's already-loaded JSON body. */
export function parseCase(raw) {
  if (typeof raw !== 'object' || raw === null) fail('case must be a JSON object')
  if (typeof raw.request !== 'string' || !raw.request.trim()) fail('case.request must be a non-empty string')
  if (!Array.isArray(raw.checks)) fail('case.checks must be an array')
  if (raw.plan !== undefined && !PLAN_EXPECTATIONS.includes(raw.plan)) fail(`case.plan must be one of ${PLAN_EXPECTATIONS.join(', ')}, got ${JSON.stringify(raw.plan)}`)
  return {
    request: raw.request.trim(),
    checks: raw.checks.map(validateStep),
    reload: raw.reload === true,
    plan: raw.plan ?? null,
    adjust: parseApproval(raw.approval),
  }
}

/** The case's `approval` key: absent (approve), or `{ "answer": "Pedir ajustes", "change": "<free text>" }` (ask for one change, then approve). @returns {string | null} the change text */
function parseApproval(raw) {
  if (raw === undefined) return null
  if (typeof raw !== 'object' || raw === null || raw.answer !== ADJUST_LABEL) fail(`case.approval.answer must be "${ADJUST_LABEL}"`)
  if (typeof raw.change !== 'string' || !raw.change.trim()) fail('case.approval.change must be the non-empty free text of the change')
  return raw.change.trim()
}

const STEP_TIMEOUT_MS = 15_000

// Playwright's assertion message spans several colored lines (expected, received, call log); the
// record keeps the first ones, where the expected and received text live.
const describeError = (error) => {
  if (!(error instanceof Error)) return String(error)
  return error.message.replace(/\u001b\[[0-9;]*m/g, '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 4).join(' | ').slice(0, 500)
}

/** Run one step against a Playwright FrameLocator (or Page). Never throws: failures are data. */
async function runStep(target, step) {
  try {
    const locator = target.locator(step.selector)
    if (step.action === 'fill') {
      await locator.first().fill(step.value, { timeout: STEP_TIMEOUT_MS })
    } else if (step.action === 'click') {
      await locator.first().click({ timeout: STEP_TIMEOUT_MS })
    } else if (step.action === 'expectText') {
      // An app that saves through its API renders the result after the request returns, so the
      // assertion retries until the text appears or the timeout passes. Case is the app's choice
      // ("Data Prevista" and "Data prevista" are the same label), so it is ignored.
      await expect(locator.first()).toContainText(step.text, { timeout: STEP_TIMEOUT_MS, ignoreCase: true })
    } else {
      // Absence passes at once on a page that has not rendered its data yet; a case proves the
      // data loaded with an expectText step before this one.
      await expect(locator.first()).not.toContainText(step.text, { timeout: STEP_TIMEOUT_MS, ignoreCase: true })
    }
    return { ...step, ok: true, error: null }
  } catch (error) {
    return { ...step, ok: false, error: describeError(error) }
  }
}

/**
 * Run every step in order against `target` (a Playwright FrameLocator, usually the Preview
 * iframe). A failing step is recorded, not thrown, so later steps still run and the caller sees
 * the whole picture instead of the first symptom.
 */
export async function runChecks(target, checks) {
  const results = []
  for (const step of checks) results.push(await runStep(target, step))
  return results
}

export const checksPassed = (results) => results.length > 0 && results.every((result) => result.ok)
