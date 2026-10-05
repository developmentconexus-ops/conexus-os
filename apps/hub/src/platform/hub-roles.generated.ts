// GENERATED from contracts/technical/hub-database-roles.json by scripts/generate-hub-role-register.mjs. Do not edit.

export const HUB_ROLE_REGISTER_DIGEST = "c8bbf470cc8a338b1d9e5d74ecdc1889903d257994e04b03aa61df6ab15f52f8"

export type HubRoleRow = Readonly<{
  role: string
  capability: string
  passwordFileVariable: string
  roleVariable?: string
  // Connects only when its feature is configured, so its absence is not a census finding.
  optional?: true
  connectsFrom: readonly string[]
}>

export const HUB_ROLES: readonly HubRoleRow[] = Object.freeze([
  Object.freeze({ role: "hub_runtime", capability: "hub-data", passwordFileVariable: "CONEXUS_DB_PASSWORD_FILE", roleVariable: "CONEXUS_DB_USER", connectsFrom: ["apps/hub/src/hub.ts"] }),
  Object.freeze({ role: "hub_factory", capability: "factory-storage", passwordFileVariable: "CONEXUS_DB_FACTORY_PASSWORD_FILE", optional: true, connectsFrom: ["apps/hub/src/builder/module.ts"] }),
])

export const CAPABILITY_BY_ROLE: Readonly<Record<string, string>> = Object.freeze({
  hub_runtime: "hub-data",
  hub_factory: "factory-storage",
})

export const POLICY_ROLES = [{"role":"iam_rls","owns":[],"privileges":["SELECT"]}] as const
