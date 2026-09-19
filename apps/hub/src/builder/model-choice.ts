import type { ModelChoice } from '../model-connection/model-catalog.js'

export type BuilderModelIdentity = Readonly<{
  admissionId: string
  providerId: string
  modelId: string
}>

export const resolveBuilderModelChoice = (
  choices: readonly ModelChoice[],
  choiceId: string | undefined,
): Readonly<{ choice: ModelChoice; identity: BuilderModelIdentity }> => {
  const choice = choices.find((candidate) => candidate.choiceId === (choiceId ?? choices[0]?.choiceId))
  if (!choice) throw new Error('BUILDER_MODEL_CHOICE_REFUSED')
  return Object.freeze({
    choice,
    identity: Object.freeze({ admissionId: choice.choiceId, providerId: choice.providerId, modelId: choice.modelId }),
  })
}
