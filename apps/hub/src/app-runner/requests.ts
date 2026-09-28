import { z } from 'zod'
import { callerSchema } from '../platform/caller.js'

/** The two requests the Hub may send the runner, parsed strictly at its socket. */
const serverFile = z.object({ path: z.string().max(512), sha256: z.string().regex(/^[0-9a-f]{64}$/), content: z.string() }).strict()
// The Hub says whether a divergent migration history may reset the Preview schema; it is required so a
// missing flag never falls through to the destructive path.
export const prepareBody = z.object({ projectId: z.uuid(), files: z.array(serverFile).min(1).max(128), onDivergence: z.enum(['RESET', 'REFUSE']) }).strict()
// The caller is a platform fact beside the input, never inside it: the Hub resolved it from a session.
// The connector socket is a platform fact too: the Hub's port for this one invocation, checked by the
// supervisor against its own configured directory before anything binds it.
export const invokeBody = z.object({
  projectId: z.uuid(), operation: z.string().regex(/^[a-z][A-Za-z0-9]{0,63}$/), input: z.unknown(), files: z.array(serverFile).min(1).max(128), caller: callerSchema,
  connectorSocket: z.string().min(2).max(107).optional(),
}).strict()
// Sent once, when the Project itself is deleted: drop its Preview schema and roles for good.
export const releaseBody = z.object({ projectId: z.uuid() }).strict()
