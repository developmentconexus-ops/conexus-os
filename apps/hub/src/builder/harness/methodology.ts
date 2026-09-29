import type { RequestContext } from '@mastra/core/request-context'
import { readPromptVariant } from './request-context.js'

/**
 * The methodologies a run can follow (study 34, section 4). A run names one by its prompt variant id,
 * which travels only in the request context. Everything a methodology changes outside its prompt
 * folder is a field here, and the mode guard, `submit_plan`, the commit and the instructions read the
 * record, never the id.
 * @public Tests import this at runtime from the built module.
 */
export const PROMPT_VARIANTS = Object.freeze(['v2', 'afiado', 'escopo', 'tarefas', 'fatias'] as const)
export type PromptVariantId = (typeof PROMPT_VARIANTS)[number]
/** @public Tests import this at runtime from the built module. */
export const DEFAULT_PROMPT_VARIANT: PromptVariantId = 'v2'

/** A point where the person approves: the scope of a new app, the whole plan, or the next slice. */
type MethodologyGate = 'escopo' | 'plano' | 'fatia'

export type MethodologyVariant = Readonly<{
  id: PromptVariantId
  /** Folder under harness/prompt/ holding this methodology's `plan.md` and `build.md`. */
  promptFolder: string
  /** The only folder Planejar may write, and where `submit_plan` takes its file from. */
  planRoot: string
  /** The plan path `submit_plan`'s description shows as its example, in this methodology's layout. */
  planPathExample: string
  /** Whether plan files become part of the conversation's branch and its versions; false leaves them out of every commit. */
  planCommitted: boolean
  /** The approvals the prompt asks for, in order. The prompt folder implements them; the harness test keeps the two in step. */
  gates: readonly MethodologyGate[]
  /** How Construir works through the plan: in one turn, task by task in one turn, or one slice per turn. */
  execution: 'single-turn' | 'task-loop' | 'slices'
  /** Whether Construir's instructions carry the plan the person approved in this conversation. */
  activePlanInBuild: boolean
  /** Whether Planejar's instructions carry the shared planning checklist (`prompt/plan-checklist.md`), seven steps the model keeps on the task list. */
  planningChecklist: boolean
}>

const variant = (definition: MethodologyVariant): MethodologyVariant => Object.freeze(definition)

// The four arms share the plan's home, the planning checklist and the plan's carry into Construir;
// they differ in gates and execution.
const committedPlan = Object.freeze({
  planRoot: 'docs/planos/',
  planPathExample: 'docs/planos/0001-painel-de-chamados/plano.md',
  planCommitted: true,
  activePlanInBuild: true,
  planningChecklist: true,
})

/** @public Tests import this at runtime from the built module. */
export const METHODOLOGY_VARIANTS: Readonly<Record<PromptVariantId, MethodologyVariant>> = Object.freeze({
  v2: variant({
    id: 'v2', promptFolder: 'v2', planRoot: '.conexus/plans/', planPathExample: '.conexus/plans/add-dark-mode.md',
    planCommitted: false, gates: ['plano'], execution: 'single-turn', activePlanInBuild: false, planningChecklist: false,
  }),
  afiado: variant({ id: 'afiado', promptFolder: 'afiado', ...committedPlan, gates: ['plano'], execution: 'single-turn' }),
  escopo: variant({ id: 'escopo', promptFolder: 'escopo', ...committedPlan, gates: ['escopo', 'plano'], execution: 'single-turn' }),
  tarefas: variant({ id: 'tarefas', promptFolder: 'tarefas', ...committedPlan, gates: ['plano'], execution: 'task-loop' }),
  fatias: variant({ id: 'fatias', promptFolder: 'fatias', ...committedPlan, gates: ['plano', 'fatia'], execution: 'slices' }),
})

const isPromptVariantId = (value: string): value is PromptVariantId => (PROMPT_VARIANTS as readonly string[]).includes(value)

/** The run's methodology: the one its request context names, the default when it names none, and undefined for an id the Hub does not ship. */
export const readMethodology = (requestContext: RequestContext | undefined): MethodologyVariant | undefined => {
  const id = readPromptVariant(requestContext) ?? DEFAULT_PROMPT_VARIANT
  return isPromptVariantId(id) ? METHODOLOGY_VARIANTS[id] : undefined
}

/** Paths every commit of a run on this methodology leaves out: its plan folder, unless its plans are committed. */
export const uncommittedPlanPaths = (methodology: MethodologyVariant): readonly string[] =>
  methodology.planCommitted ? [] : [methodology.planRoot.replace(/\/+$/, '')]
