// The plan-and-approval flow of one Builder run, read from its tool calls. Spec 0004 (AC-13, AC-14):
// the Builder writes `.conexus/plan.md` before any app file and asks for the approval with `submit_plan`,
// which the person answers on the plan card. An `ask_user` with the approval options is still read as an
// approval, so a run of the earlier Builder scores on the same terms. The baseline's `.conexus/plans/<file>`
// is read too; delete that branch (marked "legacy") once the comparison is written.

import { ASK_USER_TOOL, EDIT_FILE_TOOL, SUBMIT_PLAN_TOOL, WRITE_FILE_TOOL } from './tool-names.mjs'

export const APPROVE_LABEL = 'Aprovar e construir'
export const ADJUST_LABEL = 'Pedir ajustes'
const PLAN_FILE = '.conexus/plan.md'
const LEGACY_PLAN_DIR = '.conexus/plans/'
const WRITE_TOOLS = new Set([WRITE_FILE_TOOL, EDIT_FILE_TOOL])

export const foldLabel = (value) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
const CHECKOUT = '/workspace/repo/'
// The model spells a path as the sandbox filesystem reads it: relative to the checkout, or absolute under it.
const normalizePath = (path) => {
  const text = String(path ?? '')
  return (text.startsWith(CHECKOUT) ? text.slice(CHECKOUT.length) : text).replace(/^\.\//, '')
}

/** Pure. True when a card's option labels are the approval pair: what tells the approval card from any other question. */
export const isApprovalOptions = (labels) => {
  const seen = new Set(labels.map(foldLabel))
  return seen.has(foldLabel(APPROVE_LABEL)) && seen.has(foldLabel(ADJUST_LABEL))
}

/** @returns {'ask_user' | 'submit_plan' | null} how this tool call asked for the approval. */
function approvalVia(call) {
  if (call.entityName === ASK_USER_TOOL) {
    // The one-question call is the approval; a trace from before `questions` carried `options` on the input itself.
    const questions = Array.isArray(call.input?.questions) ? call.input.questions : null
    const options = (questions ? (questions.length === 1 ? questions[0]?.options : null) : call.input?.options) ?? []
    return Array.isArray(options) && isApprovalOptions(options.map((option) => (typeof option === 'string' ? option : option?.label))) ? 'ask_user' : null
  }
  return call.entityName === SUBMIT_PLAN_TOOL ? 'submit_plan' : null
}

const planFileOf = (path) => (path === PLAN_FILE ? 'plan' : path.startsWith(LEGACY_PLAN_DIR) ? 'legacy-plan' : null)
const isAppFile = (path) => path !== '' && !path.startsWith('.conexus/')
const failed = (call) => Boolean(call.error) || call.attributes?.success === false

/**
 * Pure. The plan file, the approval and the app files changed before it, from the main agent's tool
 * calls in start order.
 * @param {readonly object[]} calls tool_call spans in start order
 * @returns {Readonly<{
 *   planFile: Readonly<{ written: boolean, legacy: boolean, beforeFirstAppFile: boolean }>,
 *   approval: Readonly<{ via: 'ask_user' | 'submit_plan' | null }>,
 *   appFilesBeforeApproval: number | null, appFilesChanged: number }>}
 */
export function flowOf(calls) {
  let plan = null
  let firstAppIndex = -1
  let approvalIndex = -1
  let via = null
  const appFiles = []
  calls.forEach((call, index) => {
    if (via === null) {
      const found = approvalVia(call)
      if (found) { via = found; approvalIndex = index }
    }
    if (!WRITE_TOOLS.has(call.entityName) || failed(call)) return
    const path = normalizePath(call.input?.path)
    const kind = planFileOf(path)
    if (kind) { plan ??= { kind, index }; return }
    if (!isAppFile(path)) return
    if (firstAppIndex === -1) firstAppIndex = index
    appFiles.push({ path, index })
  })
  const before = approvalIndex === -1 ? null : new Set(appFiles.filter((file) => file.index < approvalIndex).map((file) => file.path)).size
  return {
    planFile: { written: plan !== null, legacy: plan?.kind === 'legacy-plan', beforeFirstAppFile: plan !== null && (firstAppIndex === -1 || plan.index < firstAppIndex) },
    approval: { via },
    appFilesBeforeApproval: before,
    appFilesChanged: new Set(appFiles.map((file) => file.path)).size,
  }
}

/** Pure. The approval path the driver's own record of answered cards shows, for a run with no trace. */
const approvalViaAnswers = (answers) => (answers.some((answer) => answer.kind === 'APPROVAL') ? 'ask_user' : answers.some((answer) => answer.kind === 'PLAN') ? 'submit_plan' : null)

/** The case's `plan` key: whether the request should get a plan and an approval. */
export const PLAN_EXPECTATIONS = Object.freeze(['expected', 'notApplicable'])

/**
 * Pure. The AC-13 measures of one case run: planned when it should (null for a case that says
 * notApplicable or says nothing), app files changed before the approval, the person's clicks, time
 * to the first Prévia, and the checks and operations that ran. `flow` and the counts are null with
 * no trace; the driver's record still gives the approval path and the clicks.
 * @param {Readonly<{ expectation: string | null, flow: ReturnType<typeof flowOf> | null, answers: readonly { kind: string }[],
 *   timeToFirstPreviewMs: number | null, checkRuns: number | null, operationRuns: number | null }>} input
 */
export function ac13Metrics({ expectation, flow, answers, timeToFirstPreviewMs, checkRuns, operationRuns }) {
  const via = flow ? flow.approval.via : approvalViaAnswers(answers)
  const planned = flow ? flow.planFile.written && via !== null : via !== null
  return {
    expectation,
    planned,
    plannedWhenExpected: expectation === 'expected' ? planned : null,
    planFileBeforeFirstAppFile: flow ? flow.planFile.beforeFirstAppFile : null,
    approvalVia: via,
    legacyPath: flow ? flow.planFile.legacy : false,
    appFilesBeforeApproval: flow ? flow.appFilesBeforeApproval : null,
    clicks: answers.length,
    timeToFirstPreviewMs,
    checkRuns,
    operationRuns,
  }
}
