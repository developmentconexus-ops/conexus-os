import { createApplicationSessions } from './application-session.js'
import { createHubSessions } from './hub-session.js'
import { createPreviewSessions } from './preview-session.js'
import { createSessionCore } from './session-core.js'
import type { SessionDependencies } from './session-core.js'

export const createSessions = (dependencies: SessionDependencies) => {
  const core = createSessionCore(dependencies)
  return Object.freeze({
    ...createHubSessions(dependencies, core),
    ...createApplicationSessions(dependencies, core),
    ...createPreviewSessions(dependencies, core),
  })
}

export type Sessions = ReturnType<typeof createSessions>
