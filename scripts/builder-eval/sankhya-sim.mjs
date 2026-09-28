// The simulated Sankhya ERP for the Builder eval: loopback only, synthetic data, never a real ERP.

export const SIM_DEFAULT_PORT = 4180

export const SIM_CREDENTIAL = Object.freeze({ clientId: 'eval-sim', clientSecret: 'eval-sim-secret', xToken: 'eval-sim-token' })

/** Prefix of every refusal the simulator gives for valid SQL it does not model; traceMetrics counts it. */
export const SIMULATOR_REFUSAL_MARKER = '[simulador]'

/** @returns {import('./fixtures/sales-v1.mjs').Fixture} throws on an unknown id */
export function fixtureById(id) {
  throw new Error(`not implemented: fixtureById(${id})`)
}

/**
 * Serves every registered fixture on 127.0.0.1 only.
 * @returns {Promise<{ origin: string, counters: () => { loadRecords: number, refusals: number, otherServices: number }, close: () => Promise<void> }>}
 */
export async function startSimulator({ port = SIM_DEFAULT_PORT } = {}) {
  throw new Error(`not implemented: startSimulator(${port})`)
}
