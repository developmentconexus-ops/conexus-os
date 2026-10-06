// The local Hub's certificate is trusted by the signed-in test operator's Chromium profile, not by
// Node, which is why every call goes through the page instead of a direct request.
import { randomUUID } from 'node:crypto'
import { chromium } from '@playwright/test'
import { SIM_CREDENTIAL } from './sankhya-sim.mjs'

/**
 * The simulator's Hub side is undecided (#346: main accepts connectorId 'sankhya' only). This constant
 * and openSimulatorBinding are the only code that names it.
 */
const SIMULATOR_BINDING = Object.freeze({
  connectorId: 'sankhya-sim', name: 'erp', label: 'Sankhya simulado (avaliação)',
})

/**
 * @typedef {Readonly<{
 *   workspaceId: string,
 *   usableModelIds(): Promise<string[]>,
 *   createProject(input: { name: string }): Promise<{ projectId: string }>,
 *   openSimulatorBinding(): Promise<{ connectionId: string, bindProject(projectId: string): Promise<void> }>,
 *   close(): Promise<void>,
 * }>} Hub
 */

const parseJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** @returns {Promise<Hub>} */
export async function openHub({ baseUrl, statePath }) {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await (await browser.newContext({ storageState: statePath })).newPage()
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/workspaces\/[^/]+\/projects$/, { timeout: 30_000 })
    const workspaceId = new URL(page.url()).pathname.split('/')[2]

    const call = async (method, path, { body, headers = {} } = {}) => {
      const response = await page.evaluate(async (request) => {
        const answer = await fetch(request.path, {
          method: request.method, credentials: 'same-origin',
          headers: { ...(request.body === undefined ? {} : { 'content-type': 'application/json' }), ...request.headers },
          body: request.body,
        })
        return { status: answer.status, text: await answer.text() }
      }, { method, path, headers, body: body === undefined ? undefined : JSON.stringify(body) })
      const parsed = parseJson(response.text)
      if (response.status < 200 || response.status > 299) {
        throw new Error(`builder-eval: Hub ${method} ${path} answered ${response.status} ${parsed?.title ?? response.text.slice(0, 200)}`)
      }
      return parsed
    }

    return Object.freeze({
      workspaceId,
      usableModelIds: async () => (await call('GET', '/api/control/model-accounts/models')).models.map((model) => model.id),
      createProject: async ({ name }) => {
        // A fresh key per call guards a network retry of this request, not a rerun of the job.
        const project = await call('POST', `/api/control/workspaces/${workspaceId}/projects`, {
          body: { name, sourceBootstrap: { mode: 'NEW' } }, headers: { 'idempotency-key': randomUUID() },
        })
        return { projectId: project.projectId }
      },
      openSimulatorBinding: async () => {
        const connectionsPath = `/api/control/workspaces/${workspaceId}/connections`
        const open = (await call('GET', connectionsPath)).entries
          .find((entry) => entry.connectorId === SIMULATOR_BINDING.connectorId && !entry.disabledAt)
        const { connectionId } = open ?? await call('POST', connectionsPath, {
          body: { connectionId: randomUUID(), connectorId: SIMULATOR_BINDING.connectorId, label: SIMULATOR_BINDING.label, credential: SIM_CREDENTIAL },
        })
        return {
          connectionId,
          bindProject: async (projectId) => {
            await call('POST', `/api/control/projects/${projectId}/connection-bindings`, { body: { connectionId, name: SIMULATOR_BINDING.name } })
          },
        }
      },
      close: () => browser.close(),
    })
  } catch (error) {
    await browser.close()
    throw error
  }
}
