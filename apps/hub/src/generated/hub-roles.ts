// GENERATED from contracts/technical/hub-database-roles.json by scripts/generate-hub-role-register.mjs. Do not edit.

export const HUB_ROLE_REGISTER_DIGEST = "7d8036a02ff6f7c6399deb926d0af68a0acef8383fd00e4c9a86faa7dd88aa92"

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
  Object.freeze({ role: "hub_s4_baseline_read", capability: "project-baseline-read", passwordFileVariable: "CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE", connectsFrom: ["apps/hub/src/project/module.ts"] }),
  Object.freeze({ role: "hub_s4_baseline_command", capability: "project-baseline-command", passwordFileVariable: "CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE", connectsFrom: ["apps/hub/src/project/module.ts"] }),
  Object.freeze({ role: "hub_s6_inception_command", capability: "project-inception-command", passwordFileVariable: "CONEXUS_DB_S6_INCEPTION_COMMAND_PASSWORD_FILE", connectsFrom: ["apps/hub/src/project/module.ts"] }),
  Object.freeze({ role: "hub_r2_project_binding", capability: "project-binding", passwordFileVariable: "CONEXUS_DB_R2_PROJECT_BINDING_PASSWORD_FILE", connectsFrom: ["apps/hub/src/project/module.ts"] }),
  Object.freeze({ role: "hub_r2_brain_read", capability: "brain-read", passwordFileVariable: "CONEXUS_DB_R2_BRAIN_READ_PASSWORD_FILE", connectsFrom: ["apps/hub/src/server.ts"] }),
  Object.freeze({ role: "hub_r2_brain_attester", capability: "brain-attester", passwordFileVariable: "CONEXUS_DB_R2_BRAIN_ATTESTER_PASSWORD_FILE", connectsFrom: ["apps/hub/src/project/module.ts"] }),
  Object.freeze({ role: "hub_r2_key_conformance_subject", capability: "key-conformance-subject", passwordFileVariable: "CONEXUS_DB_R2_KEY_CONFORMANCE_SUBJECT_PASSWORD_FILE", connectsFrom: ["apps/hub/src/server.ts"] }),
  Object.freeze({ role: "hub_r2_connections", capability: "connections", passwordFileVariable: "CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE", connectsFrom: ["apps/hub/src/connections/module.ts","apps/hub/src/claude-account/module.ts"] }),
  Object.freeze({ role: "hub_rb_ingress", capability: "builder-request", passwordFileVariable: "CONEXUS_DB_RB_INGRESS_PASSWORD_FILE", connectsFrom: ["apps/hub/src/builder/module.ts"] }),
  Object.freeze({ role: "hub_rb_executor", capability: "builder-run-execution", passwordFileVariable: "CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE", connectsFrom: ["apps/hub/src/builder/module.ts"] }),
])

export const CAPABILITY_BY_ROLE: Readonly<Record<string, string>> = Object.freeze({
  hub_iam_runtime: "identity-and-access",
  hub_s2_read: "workspace-read",
  hub_ws01_command: "workspace-command",
  hub_s3_read: "project-read",
  hub_prj03_command: "project-command",
  hub_s4_baseline_read: "project-baseline-read",
  hub_s4_baseline_command: "project-baseline-command",
  hub_s6_inception_command: "project-inception-command",
  hub_r2_project_binding: "project-binding",
  hub_r2_brain_read: "brain-read",
  hub_r2_brain_attester: "brain-attester",
  hub_r2_key_conformance_subject: "key-conformance-subject",
  hub_r2_connections: "connections",
  hub_rb_ingress: "builder-request",
  hub_rb_executor: "builder-run-execution",
})
