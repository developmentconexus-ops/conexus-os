import { z } from 'zod'
import { authority, type ApplicationAddress } from '../platform/config.js'

const SLUG = /^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$/
export const SLUG_LENGTH = 40
const BASE_LENGTH = 36

/** Host labels the installation keeps for itself; the CHECK on iam.application refuses the same ones. */
const RESERVED_LABELS: ReadonlySet<string> = new Set(['hub', 'www', 'api', 'auth', 'admin', 'keycloak', 'static', 'app', 'preview'])

/** An application's host label: the one rule, which the CHECK on iam.application repeats as the database's second guard. */
export const ApplicationSlug = z.string().regex(SLUG)
  .refine((value) => !value.includes('--') && !value.startsWith('preview-') && !RESERVED_LABELS.has(value))
  .brand<'ApplicationSlug'>()
export type ApplicationSlug = z.output<typeof ApplicationSlug>

export function parseApplicationSlug(value: unknown): ApplicationSlug | null {
  const parsed = ApplicationSlug.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** The label a Project's name suggests: folded to ASCII, runs of anything else to one dash, cut to 36, and moved off a reserved or non letter start. */
export function slugBase(projectName: string): string {
  const label = projectName.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, BASE_LENGTH).replace(/-+$/, '')
  if (label === '') return 'aplicativo'
  return !/^[a-z]/.test(label) || /^preview(-|$)/.test(label) || RESERVED_LABELS.has(label) ? `app-${label}` : label
}

/** The Host header is the only application selector, and it must be exactly one application's authority. */
export function applicationSlugOfHost(address: ApplicationAddress, host: string | undefined): ApplicationSlug | null {
  const suffix = authority(address, '')
  if (typeof host !== 'string' || !host.endsWith(suffix)) return null
  return parseApplicationSlug(host.slice(0, -suffix.length))
}
