import { z } from 'zod'
import { parseCaller } from '../platform/caller.js'
import type { Caller } from '../platform/caller.js'

/** The two requests the Hub may send the runner, parsed strictly at its socket. */
const serverFile = z.object({ path: z.string().max(512), sha256: z.string().regex(/^[0-9a-f]{64}$/), content: z.string() }).strict()
export const prepareBody = z.object({ projectId: z.uuid(), files: z.array(serverFile).min(1).max(128) }).strict()
// The caller is a platform fact beside the input, never inside it: the Hub resolved it from a session.
const caller = z.custom<Caller>((value) => parseCaller(value) !== null)
export const invokeBody = z.object({ projectId: z.uuid(), operation: z.string().regex(/^[a-z][A-Za-z0-9]{0,63}$/), input: z.unknown(), files: z.array(serverFile).min(1).max(128), caller }).strict()
