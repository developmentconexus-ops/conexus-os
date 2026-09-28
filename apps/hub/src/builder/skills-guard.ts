import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { defaultBuilderSkillsRoot } from './harness/index.js'

/**
 * The server/data guide the Builder loads as an agent level skill lives in the Hub's own
 * `builder-skills/conexus-server/` (AC-10), found from the Hub process's working directory. A Hub
 * started from the wrong directory would silently run every build without the guide, so this
 * refuses to start instead.
 */
export const assertBuilderSkillsAvailable = (skillsPath: string = defaultBuilderSkillsRoot()): void => {
  if (existsSync(join(skillsPath, 'SKILL.md'))) return
  throw new Error(`BUILDER_SKILLS_MISSING: ${skillsPath} has no SKILL.md; start the Hub from the repository root`)
}
