// GENERATED from contracts/technical/hub-database-roles.json by scripts/generate-hub-role-register.mjs. Do not edit.

export const HUB_ROLE_REGISTER_DIGEST = "de9aa2c36a92cfbe6066434bf98034fe4bac458a6053fa5bd78f4a93b379b88b"

export type HubRoleRow = Readonly<{
  role: string
  capability: string
  passwordFileVariable: string
  roleVariable?: string
  connectsFrom: readonly string[]
}>

export const HUB_ROLES: readonly HubRoleRow[] = Object.freeze([
  Object.freeze({ role: "hub_iam_runtime", capability: "identity-and-access", passwordFileVariable: "CONEXUS_DB_PASSWORD_FILE", roleVariable: "CONEXUS_DB_USER", connectsFrom: ["apps/hub/src/server.ts"] }),
  Object.freeze({ role: "hub_s2_read", capability: "workspace-read", passwordFileVariable: "CONEXUS_DB_S2_READ_PASSWORD_FILE", connectsFrom: ["apps/hub/src/server.ts"] }),
  Object.freeze({ role: "hub_ws01_command", capability: "workspace-command", passwordFileVariable: "CONEXUS_DB_WS01_COMMAND_PASSWORD_FILE", connectsFrom: ["apps/hub/src/server.ts"] }),
  Object.freeze({ role: "hub_s3_read", capability: "project-read", passwordFileVariable: "CONEXUS_DB_S3_READ_PASSWORD_FILE", connectsFrom: ["apps/hub/src/project/module.ts"] }),
  Object.freeze({ role: "hub_prj03_command", capability: "project-command", passwordFileVariable: "CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE", connectsFrom: ["apps/hub/src/project/module.ts"] }),
  Object.freeze({ role: "hub_r2_connections", capability: "connections", passwordFileVariable: "CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE", connectsFrom: ["apps/hub/src/claude-account/module.ts"] }),
  Object.freeze({ role: "hub_rb_ingress", capability: "builder-request", passwordFileVariable: "CONEXUS_DB_RB_INGRESS_PASSWORD_FILE", connectsFrom: ["apps/hub/src/builder/module.ts"] }),
  Object.freeze({ role: "hub_rb_executor", capability: "builder-run-execution", passwordFileVariable: "CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE", connectsFrom: ["apps/hub/src/builder/module.ts"] }),
])

export const CAPABILITY_BY_ROLE: Readonly<Record<string, string>> = Object.freeze({
  hub_iam_runtime: "identity-and-access",
  hub_s2_read: "workspace-read",
  hub_ws01_command: "workspace-command",
  hub_s3_read: "project-read",
  hub_prj03_command: "project-command",
  hub_r2_connections: "connections",
  hub_rb_ingress: "builder-request",
  hub_rb_executor: "builder-run-execution",
})
