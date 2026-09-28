import { Mastra } from '@mastra/core'
import { createScorer } from '@mastra/core/evals'
import { PostgresStore } from '@mastra/pg'
import { SIMULATOR_REFUSAL_MARKER } from './sankhya-sim.mjs'

/** Integer cents; never a float. @typedef {number} Cents */
/** @typedef {Readonly<{ cents: Cents, label: string }>} LabeledAmount */
/**
 * amounts: every one must be on screen; mistakes: none may be. Built so no mistake equals an amount.
 * @typedef {Readonly<{ names: readonly string[], amounts: readonly LabeledAmount[], mistakes: readonly LabeledAmount[] }>} ScreenTruth
 */
/**
 * Every field is additive across traces; ratios are derived in the scorer table.
 * @typedef {Readonly<{ traces: number, toolCalls: number, stepsWithToolCalls: number, toolErrors: number,
 *   repeatedReads: number, skillReloads: number, simulatorRefusals: number, wallMs: number,
 *   inputTokens: number, cachedInputTokens: number, outputTokens: number }>} TraceMetrics
 */
/** @typedef {Readonly<{ scorerId: string, scorerName: string, score: number, reason: string | undefined }>} SubmittedScore */

/** Mastra storage of the Hub database: schema factory, no DDL (the Hub owns the tables). */
export const evalStorage = (connectionString) =>
  new PostgresStore({ id: 'conexus-builder-eval', connectionString, schemaName: 'factory', disableInit: true })

/**
 * The eval's Mastra: storage plus every eval scorer, registered so Studio lists them and can run them
 * on any stored trace. Trace scorers load spans from this same storage.
 */
export function createEvalMastra({ storage }) {
  const loadSpans = async (traceId) => {
    const trace = await (await storage.getStore('observability')).getTrace({ traceId })
    if (!trace) throw new Error(`trace ${traceId} não encontrado`)
    return trace.spans
  }
  // The driver prints its summary as JSON lines on stdout; Mastra's logger would interleave there.
  return new Mastra({ storage, scorers: createScorers(loadSpans), logger: false })
}

const messageOf = (error) => (error?.cause instanceof Error ? error.cause.message : error instanceof Error ? error.message : String(error))

/**
 * Runs every registered scorer on one result. A scorer that cannot score (no trace, trace still
 * running) is left out and listed in `unscored`, so a missing trace never reads as a best-possible 0.
 * @returns {Promise<{ scores: SubmittedScore[], unscored: { scorerId: string, message: string }[] }>}
 */
export async function scoreRun(mastra, { output, groundTruth }) {
  const scorers = Object.values(mastra.listScorers())
  const outcomes = await Promise.allSettled(scorers.map((scorer) => scorer.run({ output, groundTruth })))
  const scores = []
  const unscored = []
  outcomes.forEach((outcome, index) => {
    const { id, name } = scorers[index]
    if (outcome.status === 'fulfilled') scores.push({ scorerId: id, scorerName: name, score: outcome.value.score, reason: outcome.value.reason })
    else unscored.push({ scorerId: id, message: messageOf(outcome.reason) })
  })
  return { scores, unscored }
}

// Must match the keys the Hub tags each Builder run's root span with (apps/hub/src/builder/module.ts).
const BUILDER_TRACE_KEYS = Object.freeze({ run: 'conexusBuilderRunId', project: 'conexusBuilderProjectId' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Trace id per Builder run, aligned with builderRunIds; null when no finished root appeared in time.
 * A root counts only once it has ended: a run can settle before the exporter flushes its root span.
 * @returns {Promise<(string | null)[]>}
 */
export async function findTraceIds(mastra, { projectId, builderRunIds }, { waitMs = 60_000, pollMs = 3_000 } = {}) {
  const observability = await mastra.getStorage().getStore('observability')
  const found = builderRunIds.map(() => null)
  const deadline = Date.now() + waitMs
  for (;;) {
    await Promise.all(builderRunIds.map(async (builderRunId, index) => {
      if (found[index]) return
      const { spans } = await observability.listTraces({
        filters: { metadata: { [BUILDER_TRACE_KEYS.run]: builderRunId, [BUILDER_TRACE_KEYS.project]: projectId } },
        pagination: { page: 0, perPage: 1 },
      })
      if (spans[0]?.endedAt) found[index] = spans[0].traceId
    }))
    if (found.every(Boolean) || Date.now() >= deadline) return found
    await sleep(pollMs)
  }
}

const finite = (value) => (Number.isFinite(value) ? value : 0)
const timeOf = (date) => new Date(date).getTime()
const normalizePath = (path) => String(path ?? '').replace(/^\.\//, '')
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  return value
}

/**
 * Pure. Counts over one Builder trace's main agent. A nested agent_run (the observational-memory
 * observer under memory_operation) and its tools and tokens are excluded.
 * @param {readonly import('@mastra/core/storage').SpanRecord[]} spans
 * @returns {TraceMetrics}
 */
export function traceMetrics(spans) {
  const root = spans.find((span) => !span.parentSpanId && span.spanType === 'agent_run')
  if (!root) throw new Error('trace sem agent_run raiz')
  if (!root.endedAt) throw new Error('trace ainda em execução')
  const byId = new Map(spans.map((span) => [span.spanId, span]))
  const ownerOf = (span) => {
    let ancestor = byId.get(span.parentSpanId)
    while (ancestor && ancestor.spanType !== 'agent_run') ancestor = byId.get(ancestor.parentSpanId)
    return ancestor
  }
  const mainScope = spans.filter((span) => ownerOf(span) === root)
  const calls = mainScope
    .filter((span) => span.spanType === 'tool_call')
    .sort((a, b) => timeOf(a.startedAt) - timeOf(b.startedAt) || (a.spanId < b.spanId ? -1 : 1))

  const fileReads = new Map()
  const fetches = new Set()
  const skills = new Set()
  let repeatedReads = 0
  let skillReloads = 0
  let simulatorRefusals = 0
  for (const call of calls) {
    const input = call.input ?? {}
    switch (call.entityName) {
      case 'view': {
        const path = normalizePath(input.path)
        const reads = fileReads.get(path) ?? new Set()
        const key = `${input.offset ?? ''}|${input.limit ?? ''}`
        if (reads.has(key)) repeatedReads += 1
        reads.add(key)
        fileReads.set(path, reads)
        break
      }
      case 'write_file':
      case 'string_replace_lsp':
        fileReads.delete(normalizePath(input.path))
        break
      case 'connector_fetch': {
        const key = JSON.stringify(canonical(input))
        if (fetches.has(key)) repeatedReads += 1
        fetches.add(key)
        if (JSON.stringify(call.output ?? null).includes(SIMULATOR_REFUSAL_MARKER)) simulatorRefusals += 1
        break
      }
      case 'skill':
        if (skills.has(input.name)) skillReloads += 1
        skills.add(input.name)
        break
    }
  }

  const usages = mainScope.filter((span) => span.spanType === 'model_generation').map((span) => span.attributes?.usage ?? {})
  const total = (read) => usages.reduce((sum, usage) => sum + finite(read(usage)), 0)
  return {
    traces: 1,
    toolCalls: calls.length,
    stepsWithToolCalls: new Set(calls.map((call) => call.parentSpanId)).size,
    toolErrors: calls.filter((call) => call.error || call.attributes?.success === false).length,
    repeatedReads,
    skillReloads,
    simulatorRefusals,
    wallMs: timeOf(root.endedAt) - timeOf(root.startedAt),
    inputTokens: total((usage) => usage.inputTokens),
    cachedInputTokens: total((usage) => usage.inputDetails?.cacheRead),
    outputTokens: total((usage) => usage.outputTokens),
  }
}

const sumMetrics = (all) => Object.fromEntries(Object.keys(all[0]).map((key) => [key, all.reduce((sum, metrics) => sum + metrics[key], 0)]))

const DIRECTION_LABEL = Object.freeze({ 'lower-is-better': 'menor é melhor', 'higher-is-better': 'maior é melhor' })

const TRACE_METRIC_SCORERS = Object.freeze([
  { id: 'tool-calls', description: 'Chamadas de ferramenta do agente principal', direction: 'lower-is-better', value: (m) => m.toolCalls },
  { id: 'tool-errors', description: 'Chamadas de ferramenta que falharam', direction: 'lower-is-better', value: (m) => m.toolErrors },
  { id: 'calls-per-step', description: 'Chamadas por passo com chamada', direction: 'higher-is-better', value: (m) => (m.stepsWithToolCalls === 0 ? 0 : m.toolCalls / m.stepsWithToolCalls) },
  { id: 'repeated-reads', description: 'Leituras idênticas repetidas (arquivo sem escrita no meio, ou connector_fetch igual)', direction: 'lower-is-better', value: (m) => m.repeatedReads },
  { id: 'skill-reloads', description: 'Skills carregadas de novo', direction: 'lower-is-better', value: (m) => m.skillReloads },
  { id: 'wall-minutes', description: 'Duração do agente, somando reparos', direction: 'lower-is-better', value: (m) => m.wallMs / 60_000 },
  { id: 'input-tokens', description: 'Tokens de entrada do modelo principal', direction: 'lower-is-better', value: (m) => m.inputTokens },
  { id: 'output-tokens', description: 'Tokens de saída do modelo principal', direction: 'lower-is-better', value: (m) => m.outputTokens },
  { id: 'sim-refusals', description: 'Consultas válidas que o simulador não sabe responder (culpa do avaliador)', direction: 'lower-is-better', value: (m) => m.simulatorRefusals },
])

/** The driver's RunOutput names its traces; Studio scoring a stored trace passes targetTraceId. */
const traceIdsOf = (run) => {
  const runs = run.output?.runs
  if (Array.isArray(runs)) {
    if (runs.length === 0 || runs.some((record) => !record.traceId)) throw new Error('trace ausente')
    return runs.map((record) => record.traceId)
  }
  if (run.targetTraceId) return [run.targetTraceId]
  throw new Error('sem output.runs nem targetTraceId: nada para medir')
}

function createScorers(loadSpans) {
  const metricsByTraceSet = new Map()
  const metricsOf = (traceIds) => {
    const key = traceIds.join(',')
    if (!metricsByTraceSet.has(key)) {
      const metrics = Promise.all(traceIds.map(async (traceId) => traceMetrics(await loadSpans(traceId)))).then(sumMetrics)
      metrics.catch(() => metricsByTraceSet.delete(key))
      metricsByTraceSet.set(key, metrics)
    }
    return metricsByTraceSet.get(key)
  }
  const appCorrect = createScorer({ id: 'app-correct', description: 'A prévia mostra todos os nomes e valores certos e nenhum total errado conhecido (1 ou 0)' })
    .preprocess(({ run }) => gradeScreen(run.output, run.groundTruth?.screen))
    .generateScore(({ results }) => results.preprocessStepResult.score)
    .generateReason(({ results }) => results.preprocessStepResult.reason)
  const traceScorers = TRACE_METRIC_SCORERS.map((row) =>
    createScorer({ id: row.id, description: `${row.description} (${DIRECTION_LABEL[row.direction]})` })
      .preprocess(({ run }) => metricsOf(traceIdsOf(run)))
      .generateScore(({ results }) => row.value(results.preprocessStepResult)))
  return Object.fromEntries([appCorrect, ...traceScorers].map((scorer) => [scorer.id, scorer]))
}

const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const BRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl = (cents) => `R$ ${BRL.format(cents / 100)}`
const firstFive = (items) => items.slice(0, 5).join(', ') + (items.length > 5 ? ` e mais ${items.length - 5}` : '')

// A dashboard that rounds to whole reais still shows the right number.
const matchesCents = (amount, cents) => amount.cents === cents || (amount.wholeReais && amount.cents === Math.round(cents / 100) * 100)

// A per-seller-month label is "APELIDO · mon/yyyy" (fixtures/sales-v1.mjs); "total geral" has no split.
const sellerMonthOf = (label) => {
  const at = label.indexOf(' · ')
  return at < 0 ? null : { seller: label.slice(0, at), month: label.slice(at + 3) }
}

/**
 * A Preview's plain text is a browser's `innerText` of the rendered dashboard: an HTML table reads
 * back as one tab-separated line per row, header included. Binds each seller-month amount to the
 * cell at its own row and column, so amounts swapped between sellers or months are told apart even
 * though every number and name is still somewhere on screen. Returns null when the text carries no
 * such table (at least two of the truth's month labels in one line's cells), so the caller falls
 * back to whole-text matching.
 * @returns {Map<string, { cents: Cents, wholeReais: boolean }> | null}
 */
function tableOf(text, { names, monthTokens }) {
  const foldedNames = new Set(names.map(fold))
  const observed = new Map()
  let columnMonth = null
  for (const line of text.split('\n')) {
    if (!line.includes('\t')) continue
    const cells = line.split('\t')
    const headerRow = cells.map((cell) => (monthTokens.has(fold(cell.trim())) ? fold(cell.trim()) : undefined))
    if (headerRow.filter(Boolean).length >= 2) {
      columnMonth = headerRow
      continue
    }
    if (!columnMonth) continue
    const sellerCell = cells.find((cell) => foldedNames.has(fold(cell.trim())))
    if (!sellerCell) continue
    const seller = fold(sellerCell.trim())
    cells.forEach((cell, index) => {
      const month = columnMonth[index]
      const [amount] = month ? parseAmounts(cell) : []
      if (amount) observed.set(`${seller}|${month}`, amount)
    })
  }
  return observed.size > 0 ? observed : null
}

/**
 * Pure. 1 when every name is on screen, every seller-month amount is at its own seller and month,
 * the grand total is on screen, and no mistake amount is; else 0. An output that is not a RunOutput
 * throws, so Studio scoring an arbitrary trace gets an error, not a false 0.
 * @param {ScreenTruth} truth
 * @returns {{ score: 0 | 1, reason: string }}
 */
function gradeScreen(output, truth) {
  if (!truth) throw new Error('groundTruth.screen ausente')
  const preview = output?.preview
  if (preview?.kind === 'not-built') return { score: 0, reason: `A prévia não ficou pronta (${preview.reason})` }
  if (preview?.kind !== 'observed' || typeof preview.text !== 'string') throw new Error('o output não é o resultado de um Builder run')
  const amounts = parseAmounts(preview.text)
  const shown = (cents) => amounts.some((amount) => matchesCents(amount, cents))
  const text = fold(preview.text)
  const missingNames = truth.names.filter((name) => !text.includes(fold(name)))

  const monthTokens = new Set(truth.amounts.map((amount) => sellerMonthOf(amount.label)).filter(Boolean).map((pair) => fold(pair.month)))
  const table = tableOf(preview.text, { names: truth.names, monthTokens })
  const missingAmounts = truth.amounts.filter((amount) => {
    const pair = sellerMonthOf(amount.label)
    if (!pair || !table) return !shown(amount.cents)
    const cell = table.get(`${fold(pair.seller)}|${fold(pair.month)}`)
    return !cell || !matchesCents(cell, amount.cents)
  })
  const mistakesShown = truth.mistakes.filter((mistake) => shown(mistake.cents))
  const problems = [
    ...(missingNames.length > 0 ? [`faltam nomes: ${firstFive(missingNames)}`] : []),
    ...(missingAmounts.length > 0 ? [`faltam valores: ${firstFive(missingAmounts.map((amount) => `${brl(amount.cents)} (${amount.label})`))}`] : []),
    ...mistakesShown.slice(0, 5).map((mistake) => `aparece ${brl(mistake.cents)}, ${mistake.label}`),
  ]
  if (problems.length > 0) return { score: 0, reason: problems.join('; ') }
  return { score: 1, reason: `Os ${truth.names.length} nomes e ${truth.amounts.length} valores aparecem, e nenhum total errado conhecido.` }
}

const NUMBER = /\d[\d.,]*\d|\d/g
const GROUPED = /^\d{1,3}(?:([.,])\d{3}(?:\1\d{3})*)?$/

/**
 * pt-BR or en: a separator followed by one or two final digits is decimal, groups of three are
 * thousands, and no decimal part means whole reais, so '1.234' is 123400 cents.
 * @returns {{ cents: Cents, wholeReais: boolean }[]}
 */
function parseAmounts(text) {
  const amounts = []
  for (const [token] of text.matchAll(NUMBER)) {
    const decimal = /^(.*\d)([.,])(\d{1,2})$/.exec(token)
    const whole = decimal ? decimal[1] : token
    const grouping = GROUPED.exec(whole)
    if (!/^\d+$/.test(whole) && !grouping) continue
    if (decimal && grouping?.[1] === decimal[2]) continue
    const fraction = decimal ? Number(decimal[3].padEnd(2, '0')) : 0
    amounts.push({ cents: Number(whole.replace(/[.,]/g, '')) * 100 + fraction, wholeReais: !decimal })
  }
  return amounts
}
