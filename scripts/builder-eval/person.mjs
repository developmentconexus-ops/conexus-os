// The scripted person: the stand-in for the manager who talks to the Builder in a bakeoff run. It
// answers each question card from the case's answer sheet, says it does not know when the sheet is
// silent, approves every plan gate and, once, sends a correction built from the oracle's diff.
//
// A model only decides which sheet rule a question touches. The words the person says come from the
// sheet, never from the model, so a run cannot drift from its answer sheet, and a silent sheet gives
// the same answer in every arm. The person never sees the arm: it gets the card and nothing else.
import { readFileSync } from 'node:fs'
import { opencodeClaudeMaxProvider } from '@mastra/code-sdk/providers/claude-max'
import { Agent } from '@mastra/core/agent'
import { z } from 'zod'

const PERSON_MODEL_ENV = 'CONEXUS_EVAL_PERSON_MODEL'
const VALUES_FILE_ENV = 'CONEXUS_EVAL_VALUES_FILE'
// A model of the Anthropic catalog the Hub offers (`ANTHROPIC_MODELS`), through the Claude subscription
// signed in to Mastra Code's own store by `login.mjs`.
const SUBSCRIPTION_PERSON_MODEL = 'claude-opus-5-5'
const SILENT_TEXT = 'Não sei.'
const DEFAULT_CONTINUE_TEXT = 'Pode seguir com a próxima fatia.'

const SILENT_OPTION = /n[ãa]o sei|tanto faz|qualquer|voc[êe] decide|voc[êe] escolhe/i
const RECOMMENDED = /recomend/i

const fail = (message) => {
  throw new Error(`builder-eval person: ${message}`)
}

const text = (value, where) => {
  if (typeof value !== 'string' || !value.trim()) fail(`${where} must be a non-empty string`)
  return value.trim()
}

/**
 * The answer sheet of one case.
 * @typedef {Readonly<{ id: string, topic: string, say: string, pick: readonly string[], hidden: boolean }>} SheetRule
 * @typedef {Readonly<{ projectName: string, persona: string, continueText: string, rules: readonly SheetRule[] }>} Sheet
 */

/** Parses a case file's `person` block. Placeholders stay in the text until {@link fillValues}. @returns {Sheet} */
export function parseSheet(raw) {
  if (typeof raw !== 'object' || raw === null) fail('the case has no person block')
  if (!Array.isArray(raw.answers)) fail('person.answers must be an array')
  const ids = new Set()
  const rules = raw.answers.map((entry, index) => {
    const where = `person.answers[${index}]`
    const id = text(entry?.id, `${where}.id`)
    if (ids.has(id)) fail(`${where}.id ${id} appears twice`)
    ids.add(id)
    const pick = entry.pick ?? []
    if (!Array.isArray(pick) || pick.some((word) => typeof word !== 'string' || !word.trim())) fail(`${where}.pick must be an array of words`)
    return Object.freeze({ id, topic: text(entry.topic, `${where}.topic`), say: text(entry.say, `${where}.say`), pick: Object.freeze(pick.map((word) => word.trim())), hidden: entry.hidden === true })
  })
  return Object.freeze({
    projectName: text(raw.projectName, 'person.projectName'),
    persona: text(raw.persona, 'person.persona'),
    continueText: raw.continue === undefined ? DEFAULT_CONTINUE_TEXT : text(raw.continue, 'person.continue'),
    rules: Object.freeze(rules),
  })
}

/** Reads the private values file (`{ "name": "value" }`) named by CONEXUS_EVAL_VALUES_FILE; `{}` when unset. */
export function loadValues(env = process.env) {
  const path = env[VALUES_FILE_ENV]
  if (!path) return {}
  const values = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof values !== 'object' || values === null || Object.values(values).some((value) => typeof value !== 'string')) fail(`${VALUES_FILE_ENV} must hold a JSON object of strings`)
  return values
}

const PLACEHOLDER = /\{\{value:([A-Za-z0-9_]+)\}\}/g

/** Pure. Replaces each `{{value:name}}` with the private value; a missing one names the placeholder, never a value. */
export function fillValues(template, values) {
  return template.replace(PLACEHOLDER, (_match, name) => {
    if (typeof values[name] !== 'string') fail(`the case needs the value "${name}"; put it in the file named by ${VALUES_FILE_ENV}`)
    return values[name]
  })
}

/**
 * Pure. The sheet with every placeholder filled, so a missing value stops the run before it starts.
 * The matcher model reads `template`, the text with its placeholders, so a private value never leaves the machine.
 * @returns {Sheet}
 */
export const fillSheet = (sheet, values) => Object.freeze({ ...sheet, rules: Object.freeze(sheet.rules.map((rule) => Object.freeze({ ...rule, template: rule.say, say: fillValues(rule.say, values) }))) })

const plain = (value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/**
 * A question the Builder put on screen. `options` is empty for a free-text question; `multi` is true
 * for a card that takes several options.
 * @typedef {Readonly<{ question: string, options: readonly Readonly<{ label: string, description: string }>[], multi: boolean }>} QuestionCard
 * @typedef {Readonly<{ answer: string | readonly string[], via: 'sheet' | 'silent', ruleIds: readonly string[] }>} Decision
 */

/**
 * Pure. What the person does when the sheet says nothing: never the option the Builder recommends.
 * An option that says so ("não sei", "tanto faz") wins; otherwise the last option that is neither
 * the first (the recommendation by convention) nor marked as recommended.
 */
export function silentOption(options) {
  const said = options.find((option) => SILENT_OPTION.test(option.label))
  if (said) return said
  const others = options.slice(1).filter((option) => !RECOMMENDED.test(`${option.label} ${option.description}`))
  return others.at(-1) ?? options[0]
}

/**
 * Pure. The person's answer to a question card once the rules it touches are known. On an option
 * card the rule's `pick` words find the option; failing that, `hinted` labels (the ones the matcher
 * judged to say what the sheet says) count when the card really has them.
 * @param {Sheet} sheet
 * @param {QuestionCard} card
 * @param {readonly string[]} matchedIds
 * @param {readonly string[]} [hinted]
 * @returns {Decision}
 */
export function decideAnswer(sheet, card, matchedIds, hinted = []) {
  const rules = matchedIds.flatMap((id) => sheet.rules.filter((rule) => rule.id === id))
  const ruleIds = rules.map((rule) => rule.id)
  if (card.options.length === 0) {
    return rules.length === 0 ? { answer: SILENT_TEXT, via: 'silent', ruleIds } : { answer: rules.map((rule) => rule.say).join(' '), via: 'sheet', ruleIds }
  }
  const byWord = card.options.filter((option) => rules.some((rule) => rule.pick.some((word) => plain(option.label).includes(plain(word)))))
  const chosen = byWord.length > 0 || rules.length === 0 ? byWord : card.options.filter((option) => hinted.includes(option.label))
  if (chosen.length > 0) return { answer: card.multi ? chosen.map((option) => option.label) : chosen[0].label, via: 'sheet', ruleIds }
  const fallback = silentOption(card.options).label
  return { answer: card.multi ? [fallback] : fallback, via: 'silent', ruleIds }
}

const matchSchema = z.object({ ruleIds: z.array(z.string()), optionLabels: z.array(z.string()) })

const matcherInstructions = (sheet) => [
  `Você escolhe qual resposta combinada vale para uma pergunta. Quem responde é ${sheet.persona}`,
  'Dada uma pergunta (e as opções dela, se houver), devolva em ruleIds os ids das respostas combinadas cujo assunto a pergunta pede de forma clara.',
  'Se a pergunta tem opções, devolva em optionLabels, copiados sem mudar, os rótulos das opções que dizem o mesmo que a resposta combinada. Sem opção que diga o mesmo, deixe optionLabels vazio.',
  'Se nenhuma resposta combinada serve, devolva as duas listas vazias. Não invente id, não escolha por aproximação vaga e não responda a pergunta.',
  'Respostas combinadas (id, assunto, o que a pessoa diz):',
  ...sheet.rules.map((rule) => `- ${rule.id}: ${rule.topic}. Diz: ${rule.template ?? rule.say}`),
].join('\n')

const questionPrompt = (card) => [
  `Pergunta: ${card.question}`,
  ...(card.options.length > 0 ? ['Opções:', ...card.options.map((option) => `- ${option.label}${option.description ? `: ${option.description}` : ''}`)] : []),
].join('\n')

/**
 * The person's model: `CONEXUS_EVAL_PERSON_MODEL` (a Mastra model id) when set, else the Claude
 * subscription through Mastra Code's own claude-max provider, which reads Mastra Code's credential
 * store (`auth.json` under `MASTRA_APP_DATA_DIR` or the default app data dir) and refreshes the
 * sign-in. No token reaches this file.
 */
export const personModel = (env = process.env) => env[PERSON_MODEL_ENV] || opencodeClaudeMaxProvider(SUBSCRIPTION_PERSON_MODEL)

/**
 * The matcher is the only model call. `model` is a Mastra model id (or a model object, for a test);
 * `match` replaces the agent outright.
 * @param {Readonly<{ sheet: Sheet, model?: unknown, match?: (card: QuestionCard) => Promise<Readonly<{ ruleIds: readonly string[], optionLabels: readonly string[] }>> }>} input
 */
export function createPerson({ sheet, model = personModel(), match }) {
  const known = new Set(sheet.rules.map((rule) => rule.id))
  const agent = match ? null : new Agent({ id: 'scripted-person', name: 'Pessoa roteirizada', instructions: matcherInstructions(sheet), model })
  const matchRules = match ?? (async (card) => (await agent.generate(questionPrompt(card), { structuredOutput: { schema: matchSchema } })).object)
  return Object.freeze({
    sheet,
    /** @param {QuestionCard} card @returns {Promise<Decision>} */
    async answer(card) {
      const matched = await matchRules(card)
      return decideAnswer(sheet, card, [...new Set(matched.ruleIds.filter((id) => known.has(id)))], matched.optionLabels)
    },
  })
}

/**
 * The diff the oracle comparison found, as defects the person can put in words. Counts and field
 * names only; the person never says a company value.
 * @typedef {Readonly<{ kind: 'rows', expected: number, actual: number }>
 *   | Readonly<{ kind: 'filled', field: string, expected: number, actual: number }>
 *   | Readonly<{ kind: 'sum', name: string }>
 *   | Readonly<{ kind: 'spot', field: string }>} Defect
 */

const defectSentence = (defect) => {
  switch (defect.kind) {
    case 'rows': return `A lista mostra ${defect.actual} linhas, mas eu esperava ${defect.expected}.`
    case 'filled': return `A coluna ${defect.field} vem preenchida em ${defect.actual} linhas, mas deveria estar em ${defect.expected}.`
    case 'sum': return `A soma de ${defect.name} não fecha com o total.`
    case 'spot': return `Conferi um dos registros e o valor de ${defect.field} está errado.`
  }
}

/** Pure. The one correction message the person sends after the first Preview; null when the oracle found nothing wrong. */
export function correctionMessage(defects) {
  if (defects.length === 0) return null
  return ['Vi a prévia e encontrei o seguinte:', ...defects.map(defectSentence), 'Pode corrigir?'].join('\n')
}

/** Pure. True while the plan or the reply says slices are left: a line "Fatias restantes: N" with N above zero. */
export const slicesRemaining = (...texts) => {
  for (const source of texts.toReversed()) {
    const match = /fatias restantes\s*:\s*(\d+)/i.exec(source ?? '')
    if (match) return Number(match[1]) > 0
  }
  return false
}
