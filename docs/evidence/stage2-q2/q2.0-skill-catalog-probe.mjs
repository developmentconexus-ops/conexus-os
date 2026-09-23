import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { promisify } from 'node:util'
import { FactorySkillSource } from '@mastra/factory/workspace'
import { SandboxFilesystem } from '@mastra/code-sdk/agents/sandbox-filesystem'
import { Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from '../../../tests/implementation/hub-build.mjs'

const { APPLICATION_CHECK_FILES } = await import(hubModuleUrl('builder/application-starter.js'))
const skill = APPLICATION_CHECK_FILES.find(({ path }) => path === '.agents/skills/conexus-server/SKILL.md')
assert.ok(skill, 'the application starter must write the server guide as a Project skill')
const projectPath = mkdtempSync(join(tmpdir(), 'conexus-q2-skill-probe-'))
try {
  mkdirSync(join(projectPath, '.agents/skills/conexus-server'), { recursive: true })
  writeFileSync(join(projectPath, skill.path), skill.content)
  const executeFile = promisify(execFile)
  const sandbox = {
    id: 'q2-skill-probe',
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
  const skillSource = new FactorySkillSource(filesystem, projectSkillPaths, '')
  const factorySkillsMount = join(parse(projectPath).root, '__mastracode_factory_skills__')
  const workspace = new Workspace({
    id: 'q2-skill-probe',
    name: 'Q2 skill probe',
    filesystem,
    sandbox,
    skills: [factorySkillsMount, ...projectSkillPaths],
    skillSource,
  })
  const skills = await workspace.skills.list()
  const catalogEntry = skills.find(({ name }) => name === 'conexus-server')
  assert.ok(catalogEntry, 'the Factory skill catalog must list the Project skill')
  console.log(JSON.stringify({ name: catalogEntry.name, description: catalogEntry.description, modelRequests: 0 }))
} finally {
  rmSync(projectPath, { recursive: true, force: true })
}