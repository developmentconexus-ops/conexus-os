import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

function requestBodies(text) {
  return [...text.matchAll(/requestBody:\n([\s\S]*?)(?=\n\s{6}responses:)/g)].map(match => match[1])
}

function pathBlocks(text) {
  const starts = [...text.matchAll(/^  (\/api\/[^:]+):\s*$/gm)]
  return starts.map((match, index) => {
    const start = match.index
    const end = index + 1 < starts.length ? starts[index + 1].index : text.indexOf('\ncomponents:', start)
    return {
      path: match[1],
      text: text.slice(start, end < 0 ? text.length : end),
    }
  })
}

function permissionSection(text, permission, nextPermission) {
  const startNeedle = `| \`${permission}\` |`
  const start = text.indexOf(startNeedle)
  if (start < 0) throw new Error(`missing ${permission} Permission row`)
  const end = nextPermission ? text.indexOf(`| \`${nextPermission}\` |`, start) : text.length
  return text.slice(start, end < 0 ? text.length : end)
}

test('W-01 can refine an exact reviewed Baseline candidate without hiding candidate identity in prose', () => {
  const projectWire = read('contracts/api/product/project-paths.yaml')

  const hasExactRefinementRequest = requestBodies(projectWire).some(body => {
    const hasCandidate = /\b(?:priorCandidateBaselineDigest|candidateBaselineDigest|baselineCandidateDigest)\s*:/.test(body)
    const hasFeedback = /\b(?:reviewFeedback|refinementFeedback|baselineFeedback|feedback)\s*:/.test(body)
    return hasCandidate && hasFeedback
  })

  if (!hasExactRefinementRequest) {
    throw new Error('4C-F03-A: no Product request binds explicit human review feedback to the exact prior candidateBaselineDigest before generating a new Baseline candidate')
  }
})

test('W-01 can ask a contextual question about an exact Baseline candidate under Baseline-management authority', () => {
  const projectWire = read('contracts/api/product/project-paths.yaml')
  const builderWire = read('contracts/api/product/builder-paths.yaml')
  const permissions = read('docs/product/permission-contract.md')

  const manage = permissionSection(permissions, 'project.manage', 'project.build')
  const build = permissionSection(permissions, 'project.build', 'project.review')

  const candidateQuestionOps = [...pathBlocks(projectWire), ...pathBlocks(builderWire)]
    .filter(block => /\bquestion\s*:/.test(block.text))
    .filter(block => block.path.includes('{candidateBaselineDigest}') || /\bcandidateBaselineDigest\s*:/.test(block.text))
    .map(block => {
      const id = block.text.match(/x-conexus-4a-id:\s*([A-Z]+-[0-9]+)/)?.[1] ?? ''
      const operationId = block.text.match(/operationId:\s*([A-Za-z0-9]+)/)?.[1] ?? ''
      return { ...block, id, operationId }
    })

  if (candidateQuestionOps.length === 0) {
    throw new Error('4C-F03-B: no Product operation asks a question bound to the exact candidateBaselineDigest; current Builder assistant question is Project-context-only')
  }

  const managerUsable = candidateQuestionOps.some(op => {
    const mappedToManage = manage.includes(op.id) || manage.includes(op.operationId)
    const stillRequiresBuild = build.includes(op.id) || build.includes(op.operationId)
    return mappedToManage && !stillRequiresBuild
  })

  if (!managerUsable) {
    throw new Error('4C-F03-B: candidate-bound contextual question exists but is not usable through project.manage without also requiring distinct project.build authority')
  }
})
