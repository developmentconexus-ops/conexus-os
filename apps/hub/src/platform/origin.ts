/** A state-changing request is admitted only from one exact Origin; a missing or repeated header is refused. */
export const isExactOrigin = (header: string | string[] | undefined, expected: string): boolean =>
  typeof header === 'string' && header === expected
