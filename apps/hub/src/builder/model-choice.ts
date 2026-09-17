export type BuilderModelChoice = Readonly<{
  choiceId: string
  label: string
  providerId: string
  modelId: string
  capabilities: readonly string[]
}>

export type BuilderModelIdentity = Readonly<{
  admissionId: string
  providerId: string
  modelId: string
}>

export const resolveBuilderModelChoice = (
  choices: readonly BuilderModelChoice[],
  choiceId: string | undefined,
): Readonly<{ choice: BuilderModelChoice; identity: BuilderModelIdentity }> => {
  const choice = choices.find((candidate) => candidate.choiceId === (choiceId ?? choices[0]?.choiceId))
  if (!choice) throw new Error('BUILDER_MODEL_CHOICE_REFUSED')
  return Object.freeze({
    choice,
    identity: Object.freeze({ admissionId: choice.choiceId, providerId: choice.providerId, modelId: choice.modelId }),
  })
}
