import { config } from 'zod'

// The Hub serves the application under a script-src without 'unsafe-eval'. Zod probes for eval once,
// inside a try, and falls back on its own; the browser still reports the blocked probe as a security
// policy violation, which buries real ones. Jitless skips the probe, and this module runs before any
// other import so no schema is parsed first.
config({ jitless: true })
