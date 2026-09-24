import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { resolveLocalFactorySkillsPath } from '@mastra/factory/workspace'

const GLOBAL_SKILL_RELATIVE_PATH = join('conexus-server', 'SKILL.md')

/**
 * The server/data guide the Builder loads on every BUILD is now served as a Hub-global Factory
 * skill: `@mastra/factory`'s `FactorySkillSource` reads it from the first existing
 * `<cwd>/src/mastra/public/factory-skills`, `<cwd>/public/factory-skills` or `<cwd>/factory-skills`
 * (see `resolveLocalFactorySkillsPath`), where `<cwd>` is the Hub process's own working directory.
 * A Hub started from the wrong directory would silently run every BUILD without the guide, so this
 * refuses to start instead.
 */
export const assertFactoryGlobalSkillsAvailable = (
  cwd: string = process.cwd(),
  resolveLocalPath: (cwd: string) => string | undefined = resolveLocalFactorySkillsPath,
): void => {
  const localSkillsPath = resolveLocalPath(cwd)
  if (localSkillsPath && existsSync(join(localSkillsPath, GLOBAL_SKILL_RELATIVE_PATH))) return
  const found = localSkillsPath ? `found ${localSkillsPath}, missing conexus-server/SKILL.md` : 'no candidate factory-skills directory exists'
  throw new Error(`FACTORY_GLOBAL_SKILLS_MISSING: cwd ${cwd} (${found}); start the Hub from the repository root`)
}
