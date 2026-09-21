// GENERATED from contracts/technical/hub-database-roles.json by scripts/generate-hub-role-register.mjs. Do not edit.

export const HUB_ROLE_REGISTER_DIGEST = "a161164e4e41a70392d821c50f10121e1395072d6bc195abfa6f52a8d6984d82"

export type HubRoleRow = Readonly<{
  role: string
  capability: string
  passwordFileVariable: string
  roleVariable?: string
  connectsFrom: readonly string[]
}>

export const HUB_ROLES: readonly HubRoleRow[] = Object.freeze([
  Object.freeze({ role: "hub_iam_runtime", capability: "identity-and-access", passwordFileVariable: "CONEXUS_DB_PASSWORD_FILE", roleVariable: "CONEXUS_DB_USER", connectsFrom: ["apps/hub/src/server.ts"] }),
  Object.freeze({ role: "hub_workspace_read", capability: "workspace-read", passwordFileVariable: "CONEXUS_DB_WORKSPACE_READ_PASSWORD_FILE", connectsFrom: ["apps/hub/src/server.ts"] }),
  Object.freeze({ role: "hub_workspace_command", capability: "workspace-command", passwordFileVariable: "CONEXUS_DB_WORKSPACE_COMMAND_PASSWORD_FILE", connectsFrom: ["apps/hub/src/server.ts"] }),
  Object.freeze({ role: "hub_project_read", capability: "project-read", passwordFileVariable: "CONEXUS_DB_PROJECT_READ_PASSWORD_FILE", connectsFrom: ["apps/hub/src/project/module.ts"] }),
  Object.freeze({ role: "hub_project_command", capability: "project-command", passwordFileVariable: "CONEXUS_DB_PROJECT_COMMAND_PASSWORD_FILE", connectsFrom: ["apps/hub/src/project/module.ts"] }),
  Object.freeze({ role: "hub_builder_ingress", capability: "builder-request", passwordFileVariable: "CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE", connectsFrom: ["apps/hub/src/builder/module.ts"] }),
  Object.freeze({ role: "hub_builder_executor", capability: "builder-run-execution", passwordFileVariable: "CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE", connectsFrom: ["apps/hub/src/builder/module.ts"] }),
  Object.freeze({ role: "hub_factory", capability: "factory-storage", passwordFileVariable: "CONEXUS_DB_FACTORY_PASSWORD_FILE", connectsFrom: ["apps/hub/src/builder/factory.ts"] }),
])

export const CAPABILITY_BY_ROLE: Readonly<Record<string, string>> = Object.freeze({
  hub_iam_runtime: "identity-and-access",
  hub_workspace_read: "workspace-read",
  hub_workspace_command: "workspace-command",
  hub_project_read: "project-read",
  hub_project_command: "project-command",
  hub_builder_ingress: "builder-request",
  hub_builder_executor: "builder-run-execution",
  hub_factory: "factory-storage",
})
