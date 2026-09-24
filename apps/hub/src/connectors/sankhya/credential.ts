import { z } from 'zod'

// The gateway credential Q4 admits: client id, client secret and X-Token (the Sankhya gateway API).
// Strict and non-empty: no MGE user or password field exists here, and none is ever accepted. Bounded
// so a caller cannot post an unbounded body through this one endpoint.
export const sankhyaCredentialSchema = z.strictObject({
  clientId: z.string().min(1).max(200),
  clientSecret: z.string().min(1).max(500),
  xToken: z.string().min(1).max(500),
})

export type SankhyaCredential = z.infer<typeof sankhyaCredentialSchema>
