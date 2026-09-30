/**
 * The knowledge cutoff the prompt states, `Month YYYY`, by the model id a conversation stores
 * (`<provider>/<model>`). A model with no entry gets no cutoff clause: the prompt never guesses one.
 */
export const MODEL_KNOWLEDGE_CUTOFFS: Readonly<Record<string, string>> = Object.freeze({})
