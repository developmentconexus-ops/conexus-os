import { readFileSync } from 'node:fs'

// Whose a failed Builder run is, read from the failure table: a build or a result the agent's own
// code broke is the arm's; anything else is the platform's.
const rows = new Map(JSON.parse(readFileSync(new URL('../../contracts/technical/failures.json', import.meta.url), 'utf8')).failures.map((row) => [row.code, row]))

const RESULT_REFUSED = new Set(['BUILDER_CHECK_FAILED', 'BUILDER_APP_NOT_FIXED', 'BUILDER_RUNTIME_RESULT_SCOPE_REFUSED'])

/** The source broke the build: the only failure a repair request can fix. */
export const buildBroken = (code) => typeof code === 'string' && code.startsWith('APPLICATION_') && rows.get(code)?.category === 'USER'

/** The agent's work was refused or did not build. */
export const armOwned = (code) => buildBroken(code) || (typeof code === 'string' && (code.startsWith('BUILDER_RESULT_') || RESULT_REFUSED.has(code)))
