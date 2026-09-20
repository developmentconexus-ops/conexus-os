import { modelOfferSlug } from '../model-connection/paid-models.js'
import type { ModelOffer } from '../model-connection/paid-models.js'

export type BuilderModelIdentity = Readonly<{
  admissionId: string
  providerId: string
  modelId: string
}>

// An offer the account can pay for in this Project becomes the run's model identity. providerId is
// the connection's provider id, which is the value the run SQL compares against the credential.
export const resolveBuilderModelChoice = (
  offers: readonly ModelOffer[],
  choiceId: string | undefined,
): Readonly<{ offer: ModelOffer; identity: BuilderModelIdentity }> => {
  if (offers.length === 0) throw new Error('MODEL_CONNECTION_REQUIRED')
  const offer = offers.find((candidate) => candidate.choiceId === (choiceId ?? offers[0]?.choiceId))
  if (!offer) throw new Error('BUILDER_MODEL_CHOICE_REFUSED')
  return Object.freeze({
    offer,
    identity: Object.freeze({
      admissionId: modelOfferSlug(offer.choiceId),
      providerId: offer.providerId,
      modelId: offer.modelId,
    }),
  })
}
