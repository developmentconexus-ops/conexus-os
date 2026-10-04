// The thread's notices about the model, in place of the provider's own words, which name sandboxes,
// ids and stack frames. The run's own failure, once it settles, says the rest from the failure table, once.
export const modelRetryNotice = (attempt: number, maxRetries: number | null): string =>
  `O modelo não respondeu. Tentando de novo (${attempt}${maxRetries === null ? '' : ` de ${maxRetries}`}).`
