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

const finishedRoot = (spans) => {
  const root = spans.find((span) => !span.parentSpanId && span.spanType === 'agent_run')
  if (!root) throw new Error('trace sem agent_run raiz')
  if (!root.endedAt) throw new Error('trace ainda em execução')
  return root
}

/**
 * Pure. The reply the Builder's main agent ended its run with, as Mastra records it on the root
 * agent_run span; empty when the run stopped without one.
 * @returns {string}
 */
function finalReply(spans) {
  const text = finishedRoot(spans).output?.text
  return typeof text === 'string' ? text : ''
}

/**
 * Pure. Counts over one Builder trace's main agent. A nested agent_run (the observational-memory
 * observer under memory_operation) and its tools and tokens are excluded.
 * @param {readonly import('@mastra/core/storage').SpanRecord[]} spans
 * @returns {TraceMetrics}
 */
export function traceMetrics(spans) {
  const root = finishedRoot(spans)
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
  const appCorrect = createScorer({
    id: 'app-correct',
    description: 'O resultado é o que o caso espera: a prévia mostra todos os nomes e valores certos e nenhum total errado conhecido, '
      + 'ou, num Projeto sem a Conexão, o Builder não muda o código e diz o que vincular em Integrações (1 ou 0)',
  })
    .preprocess(async ({ run }) => (run.groundTruth?.missingSystem
      ? gradeRefusal(run.output, run.groundTruth.missingSystem, finalReply(await loadSpans(traceIdsOf(run).at(-1))))
      : gradeScreen(run.output, run.groundTruth?.screen)))
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

const MONTH_NAME_INDEX = Object.freeze({
  jan: 1, janeiro: 1,
  fev: 2, fevereiro: 2,
  mar: 3, marco: 3,
  abr: 4, abril: 4,
  mai: 5, maio: 5,
  jun: 6, junho: 6,
  jul: 7, julho: 7,
  ago: 8, agosto: 8,
  set: 9, setembro: 9,
  out: 10, outubro: 10,
  nov: 11, novembro: 11,
  dez: 12, dezembro: 12,
})

/**
 * Parses one month cell, in any of the forms a rendered dashboard or the fixture's own labels use,
 * into one canonical 'yyyy-mm' key: 'jan/2026', 'Jan 2026', 'janeiro/2026', 'Janeiro 2026',
 * 'janeiro de 2026', '01/2026', '1/2026', '2026-01', or a bare month name ('Janeiro', 'jan') when
 * `fallbackYear` is given. Null when the cell matches none of these. The truth labels
 * ('APELIDO · jan/2026') are parsed through this same function, so a differently formatted table
 * header still binds to the truth's month.
 * @returns {string | null}
 */
function monthKeyOf(rawText, { fallbackYear } = {}) {
  const text = fold(String(rawText)).trim()
  const keyed = (year, month) => (month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, '0')}` : null)

  const iso = /^(\d{4})-(\d{1,2})$/.exec(text)
  if (iso) return keyed(Number(iso[1]), Number(iso[2]))

  const numeric = /^(\d{1,2})\/(\d{4})$/.exec(text)
  if (numeric) return keyed(Number(numeric[2]), Number(numeric[1]))

  const withDe = /^([a-z]+) de (\d{4})$/.exec(text)
  if (withDe && MONTH_NAME_INDEX[withDe[1]]) return keyed(Number(withDe[2]), MONTH_NAME_INDEX[withDe[1]])

  const named = /^([a-z]+)[\s/]+(\d{4})$/.exec(text)
  if (named && MONTH_NAME_INDEX[named[1]]) return keyed(Number(named[2]), MONTH_NAME_INDEX[named[1]])

  if (MONTH_NAME_INDEX[text] && fallbackYear) return keyed(fallbackYear, MONTH_NAME_INDEX[text])

  return null
}

/**
 * A Preview's plain text is a browser's `innerText` of the rendered dashboard: an HTML table reads
 * back as one tab-separated line per row, header included. Binds each seller-month amount to the
 * cell at its own row and column, so amounts swapped between sellers or months are told apart even
 * though every number and name is still somewhere on screen. Reads either orientation: sellers as
 * rows with months as columns, or months as rows with sellers as columns. Returns null only when the
 * text has no tab-separated line at all, so the caller falls back to whole-text matching; a table
 * whose month headers never resolve to a truth month still returns (with `headerRecognized: false`),
 * so the caller can refuse to score it instead of silently falling back.
 * @returns {{ observed: Map<string, { cents: Cents, wholeReais: boolean }>, headerRecognized: boolean } | null}
 */
function tableOf(text, { names, monthKeys, fallbackYear }) {
  const foldedNames = new Set(names.map(fold))
  const observed = new Map()
  let hasTabLine = false
  let orientation = null // 'sellerRows' (months across columns) or 'monthRows' (sellers across columns)
  let columnMap = null
  let headerRecognized = false

  for (const line of text.split('\n')) {
    if (!line.includes('\t')) continue
    hasTabLine = true
    const cells = line.split('\t')

    const monthHeader = cells.map((cell) => {
      const key = monthKeyOf(cell.trim(), { fallbackYear })
      return key && monthKeys.has(key) ? key : undefined
    })
    if (monthHeader.filter(Boolean).length >= 2) {
      orientation = 'sellerRows'
      columnMap = monthHeader
      headerRecognized = true
      continue
    }

    const sellerHeader = cells.map((cell) => {
      const folded = fold(cell.trim())
      return foldedNames.has(folded) ? folded : undefined
    })
    if (sellerHeader.filter(Boolean).length >= 2) {
      orientation = 'monthRows'
      columnMap = sellerHeader
      headerRecognized = true
      continue
    }

    if (!columnMap) continue

    if (orientation === 'sellerRows') {
      const sellerCell = cells.find((cell) => foldedNames.has(fold(cell.trim())))
      if (!sellerCell) continue
      const seller = fold(sellerCell.trim())
      cells.forEach((cell, index) => {
        const month = columnMap[index]
        const [amount] = month ? parseAmounts(cell) : []
        if (amount) observed.set(`${seller}|${month}`, amount)
      })
    } else {
      const month = cells.map((cell) => monthKeyOf(cell.trim(), { fallbackYear })).find((key) => key && monthKeys.has(key))
      if (!month) continue
      cells.forEach((cell, index) => {
        const seller = columnMap[index]
        const [amount] = seller ? parseAmounts(cell) : []
        if (amount) observed.set(`${seller}|${month}`, amount)
      })
    }
  }
  return hasTabLine ? { observed, headerRecognized } : null
}

const UNBOUND_TABLE_REASON = 'a tabela tem uma linha ou coluna de mês que eu não reconheço; não dá para confirmar a qual vendedor e mês cada valor pertence'

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

  const pairs = truth.amounts.map((amount) => ({ amount, pair: sellerMonthOf(amount.label) }))
  const monthKeys = new Set(pairs.map(({ pair }) => pair && monthKeyOf(pair.month)).filter(Boolean))
  const monthYears = new Set([...monthKeys].map((key) => Number(key.slice(0, 4))))
  const fallbackYear = monthYears.size === 1 ? [...monthYears][0] : undefined
  const table = tableOf(preview.text, { names: truth.names, monthKeys, fallbackYear })
  if (table && !table.headerRecognized) return { score: 0, reason: UNBOUND_TABLE_REASON }

  const missingAmounts = pairs.filter(({ amount, pair }) => {
    if (!pair || !table) return !shown(amount.cents)
    const cell = table.observed.get(`${fold(pair.seller)}|${monthKeyOf(pair.month)}`)
    return !cell || !matchesCents(cell, amount.cents)
  }).map(({ amount }) => amount)
  const mistakesShown = truth.mistakes.filter((mistake) => shown(mistake.cents))
  const problems = [
    ...(missingNames.length > 0 ? [`faltam nomes: ${firstFive(missingNames)}`] : []),
    ...(missingAmounts.length > 0 ? [`faltam valores: ${firstFive(missingAmounts.map((amount) => `${brl(amount.cents)} (${amount.label})`))}`] : []),
    ...mistakesShown.slice(0, 5).map((mistake) => `aparece ${brl(mistake.cents)}, ${mistake.label}`),
  ]
  if (problems.length > 0) return { score: 0, reason: problems.join('; ') }
  return { score: 1, reason: `Os ${truth.names.length} nomes e ${truth.amounts.length} valores aparecem, e nenhum total errado conhecido.` }
}

/**
 * Pure. 1 when the final run changed no source and its reply names the missing system and says,
 * naming Integrações, that a Conexão must be bound or connected there; else 0. A reply that only
 * mentions Integrações in passing, or tells the person not to bind or connect, does not qualify.
 * Product contract, section 12.6.
 * @returns {{ score: 0 | 1, reason: string }}
 */
function gradeRefusal(output, system, reply) {
  const preview = output?.preview
  if (preview?.kind !== 'observed' && preview?.kind !== 'not-built') throw new Error('o output não é o resultado de um Builder run')
  const said = fold(reply)
  // A negation cue ("nao", "nunca", "sem") that precedes the verb anywhere in the same clause
  // negates it, not only when the two words are adjacent: "nao e necessario vincular", "nao
  // precisa conectar", "sem precisar vincular" all count, same as "nao vincule".
  const verbNegated = /\b(?:nao|nunca|sem)\b[^.!?;]{0,40}\b(?:vincul|conect)\w*/.test(said)
  const saysToBind = said.includes('integracoes') && said.includes('conexao') && (said.includes('vincul') || said.includes('conect'))
    && !verbNegated
  const problems = [
    ...(preview.kind === 'not-built' && preview.reason === 'NO_SOURCE_CHANGE' ? [] : ['o Builder mudou o código em vez de recusar']),
    ...(said.includes(fold(system)) ? [] : [`a resposta não nomeia ${system}`]),
    ...(saysToBind ? [] : ['a resposta não diz para vincular a Conexão em Integrações']),
  ]
  if (problems.length > 0) return { score: 0, reason: problems.join('; ') }
  return { score: 1, reason: `O Builder não mudou o código e disse que falta a Conexão com ${system} em Integrações.` }
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
