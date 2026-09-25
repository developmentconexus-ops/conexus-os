const SLUG = /^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$/

/** An application's host label, as the CHECK on iam.application admits it (which also refuses the reserved labels). */
export const parseApplicationSlug = (value: unknown): string | null =>
  typeof value === 'string' && SLUG.test(value) && !value.includes('--') ? value : null
