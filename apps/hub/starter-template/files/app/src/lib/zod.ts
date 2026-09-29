import { z } from 'zod'

// Zod probes `new Function` when it builds its first object schema, and the Prévia's policy has no
// unsafe-eval, so the probe would raise a violation on every load. main.tsx imports this file first,
// ahead of any route that builds a schema.
z.config({ jitless: true })
