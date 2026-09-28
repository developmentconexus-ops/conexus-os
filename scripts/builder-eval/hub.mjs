// The Hub control API as the eval uses it: a headless browser on the signed-in test operator's
// session, so every call rides the same cookie and CSRF header the product UI sends. The local Hub's
// certificate is trusted by that Chromium profile, not by Node, which is why calls go through the page.
import { randomUUID } from 'node:crypto'
import { chromium } from '@playwright/test'
import { SIM_CREDENTIAL } from './sankhya-sim.mjs'

/**
 * The simulator's Hub side is undecided (#346: main accepts connectorId 'sankhya' only and has no
 * sankhya.read). This constant and openSimulatorBinding are the only code that names either.
 */
const SIMULATOR_BINDING = Object.freeze({
  connectorId: 'sankhya-sim', operationIds: Object.freeze(['sankhya.read']), label: 'Sankhya simulado (avaliação)',
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
        const csrf = document.cookie.split('; ').find((entry) => entry.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
        const answer = await fetch(request.path, {
          method: request.method, credentials: 'same-origin',
          headers: { ...(request.body === undefined ? {} : { 'content-type': 'application/json' }), 'x-conexus-csrf': decodeURIComponent(csrf ?? ''), ...request.headers },
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
      usableModelIds: async () => (await call('GET', '/api/control/model-accounts/models')).models
        .filter((model) => model.hasApiKey).map((model) => model.id),
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
            const grantsPath = `/api/control/projects/${projectId}/connector-grants`
            const granted = new Set((await call('GET', grantsPath)).entries
              .filter((entry) => entry.kind === 'grant' && entry.connectionId === connectionId).map((entry) => entry.capabilityId))
            for (const operationId of SIMULATOR_BINDING.operationIds) {
              if (!granted.has(operationId)) await call('POST', grantsPath, { body: { connectionId, operationId } })
            }
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
