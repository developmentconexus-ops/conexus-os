import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { promisify } from 'node:util'
import { FactorySkillSource, resolveLocalFactorySkillsPath } from '@mastra/factory/workspace'
import { SandboxFilesystem } from '@mastra/code-sdk/agents/sandbox-filesystem'
import { Workspace } from '@mastra/core/workspace'

// Proves the server/data guide is discovered as a Hub-global Factory skill: run from the
// repository root (the Hub process's own cwd in the pilot), the local factory-skills/ mount must
// resolve, and the Factory skill catalog must list `conexus-server` for a Project checkout that
// carries no copy of its own. That rules out the pre-move behavior, where only a Project that had
// been BUILT at least once carried the guide.
const repositoryRoot = process.cwd()
const localSkillsPath = resolveLocalFactorySkillsPath(repositoryRoot)
assert.equal(localSkillsPath, join(repositoryRoot, 'factory-skills'), 'run this probe from the repository root')

const onDiskGuide = readFileSync(join(localSkillsPath, 'conexus-server/SKILL.md'), 'utf8')
assert.match(onDiskGuide, /^---\nname: conexus-server\n/, 'the global skill file must carry the same frontmatter the Builder relied on')

const projectPath = mkdtempSync(join(tmpdir(), 'conexus-global-skill-probe-'))
try {
  mkdirSync(join(projectPath, '.agents/skills'), { recursive: true }) // empty: no Project copy of the skill
  const executeFile = promisify(execFile)
  const sandbox = {
    id: 'global-skill-probe',
    async executeCommand(command, args, options) {
      try {
        const result = await executeFile(command, args, { cwd: projectPath, timeout: options?.timeout })
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr }
      } catch (error) {
        return { exitCode: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
      }
    },
  }
  const filesystem = new SandboxFilesystem({ sandbox, workdir: projectPath })
  const projectSkillPaths = ['.mastracode/skills', '.claude/skills', '.agents/skills']
  const skillSource = new FactorySkillSource(filesystem, projectSkillPaths, localSkillsPath)
  const factorySkillsMount = join(parse(projectPath).root, '__mastracode_factory_skills__')
  const workspace = new Workspace({
    id: 'global-skill-probe',
    name: 'Global skill probe',
    filesystem,
    sandbox,
    skills: [factorySkillsMount, ...projectSkillPaths],
    skillSource,
  })
  const skills = await workspace.skills.list()
  const catalogEntry = skills.find(({ name }) => name === 'conexus-server')
  assert.ok(catalogEntry, 'the Factory skill catalog must list the Hub-global conexus-server skill even for an empty Project checkout')
  console.log(JSON.stringify({ name: catalogEntry.name, description: catalogEntry.description, localSkillsPath, modelRequests: 0 }))
} finally {
  rmSync(projectPath, { recursive: true, force: true })
}
