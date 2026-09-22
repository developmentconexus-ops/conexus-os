// A case file's `checks` are a short list of Playwright steps run against the Builder's Preview
// iframe. This module owns the shape (what a step is, what counts as a valid one) and the pure
// executor (given something with `.locator()`, run the steps and report what happened) so run.mjs
// stays about orchestrating the Hub and the browser, not about interpreting JSON.

const ACTIONS = new Set(['fill', 'click', 'expectText'])

const fail = (message) => {
  throw new Error(`builder-eval case: ${message}`)
}

const validateStep = (step, index) => {
  if (typeof step !== 'object' || step === null) fail(`checks[${index}] must be an object`)
  const { action, selector, value, text } = step
  if (!ACTIONS.has(action)) fail(`checks[${index}].action must be one of ${[...ACTIONS].join(', ')}, got ${JSON.stringify(action)}`)
  if (typeof selector !== 'string' || !selector.trim()) fail(`checks[${index}].selector must be a non-empty string`)
  if (action === 'fill' && typeof value !== 'string') fail(`checks[${index}].value is required for a fill step`)
  if (action === 'expectText' && typeof text !== 'string') fail(`checks[${index}].text is required for an expectText step`)
  return { action, selector, value: value ?? null, text: text ?? null }
}

/** Parse and validate a case file's already-loaded JSON body. */
export function parseCase(raw) {
  if (typeof raw !== 'object' || raw === null) fail('case must be a JSON object')
  if (typeof raw.request !== 'string' || !raw.request.trim()) fail('case.request must be a non-empty string')
  if (!Array.isArray(raw.checks)) fail('case.checks must be an array')
  return {
    request: raw.request.trim(),
    checks: raw.checks.map(validateStep),
    reload: raw.reload === true,
  }
}

const STEP_TIMEOUT_MS = 15_000

/** Run one step against a Playwright FrameLocator (or Page). Never throws: failures are data. */
async function runStep(target, step) {
  try {
    const locator = target.locator(step.selector)
    if (step.action === 'fill') {
      await locator.first().fill(step.value, { timeout: STEP_TIMEOUT_MS })
    } else if (step.action === 'click') {
      await locator.first().click({ timeout: STEP_TIMEOUT_MS })
    } else {
      const actual = (await locator.first().innerText({ timeout: STEP_TIMEOUT_MS })).replace(/\s+/g, ' ').trim()
      if (!actual.includes(step.text)) return { ...step, ok: false, error: `expected text ${JSON.stringify(step.text)}, found ${JSON.stringify(actual.slice(0, 200))}` }
    }
    return { ...step, ok: true, error: null }
  } catch (error) {
    return { ...step, ok: false, error: error instanceof Error ? error.message.split('\n')[0] : String(error) }
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
