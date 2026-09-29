import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BUILDER_SKILL_NAMES, defaultBuilderSkillsRoot } from './harness/index.js'

/**
 * The skills the Builder loads as agent level skills live in the Hub's own `builder-skills/`
 * (AC-10), found from the Hub process's working directory. A Hub started from the wrong directory
 * would silently run every build without them, so this refuses to start instead.
 */
export const assertBuilderSkillsAvailable = (skillsPath: string = defaultBuilderSkillsRoot()): void => {
  const missing = BUILDER_SKILL_NAMES.filter((name) => !existsSync(join(skillsPath, name, 'SKILL.md')))
  if (missing.length === 0) return
  throw new Error(`BUILDER_SKILLS_MISSING: ${skillsPath} has no SKILL.md for ${missing.join(', ')}; start the Hub from the repository root`)
}
