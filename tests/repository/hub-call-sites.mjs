import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubSourceRoot = resolve(repositoryRoot, 'apps/hub/src')
const roleRegister = JSON.parse(readFileSync(resolve(repositoryRoot, 'contracts/technical/hub-database-roles.json'), 'utf8'))
export const registeredRoles = new Set([...roleRegister.roles, ...roleRegister.transactionRoles].map(({ role }) => role))

// A pool is a local variable, so no parse of the Hub's TypeScript tells a reader which login role
// reaches a given function. This table declares it. A call site missing from it fails, which is
// what stops a new call being added without saying who runs it, and a row here with no call site
// fails too, so the table cannot outlive the code it describes.
export const ROLE_BY_CALL_SITE = Object.freeze({
  'builder/store.ts': Object.freeze({
    'builder.create_builder_run': 'hub_builder_ingress',
    'builder.read_builder_run': 'hub_builder_ingress',
    'builder.list_builder_runs': 'hub_builder_ingress',
    'builder.read_latest_code_changing_builder_run': 'hub_builder_ingress',
    'builder.request_builder_run_cancellation': 'hub_builder_ingress',
    'builder.read_preview_subject': 'hub_builder_ingress',
    'builder.admit_source_revision': 'hub_builder_ingress',
    'builder.claim_builder_run': 'hub_builder_executor',
    'builder.set_builder_run_phase': 'hub_builder_executor',
    'builder.record_builder_run_candidate': 'hub_builder_executor',
    'builder.bind_builder_run_message': 'hub_builder_executor',
    'builder.bind_builder_run_sandbox': 'hub_builder_executor',
    'builder.settle_builder_run': 'hub_builder_executor',
    'builder.advance_builder_run_source': 'hub_builder_executor',
    'builder.settle_builder_run_build': 'hub_builder_executor',
    'builder.fail_builder_run': 'hub_builder_executor',
    'builder.interrupt_builder_run': 'hub_builder_executor',
    'builder.renew_run_lease': 'hub_builder_executor',
    'builder.lock_project_for_run': 'hub_builder_ingress',
    'builder.record_builder_run_model_account': 'hub_builder_executor',
    'builder.record_conversation_session': 'hub_builder_executor',
    'builder.record_conversation_sandbox': 'hub_builder_executor',
    'builder.read_conversation_sandbox': 'hub_builder_executor',
    'builder.read_project_sandboxes': 'hub_builder_executor',
    'builder.read_open_run_conversations': 'hub_builder_executor',
  }),
  'identity-access/reaper.ts': Object.freeze({
    'iam.reap_expired': 'hub_iam_runtime',
  }),
  'identity-access/application-access.ts': Object.freeze({
    'iam.list_application_access': 'hub_iam_runtime',
    'iam.grant_application_access': 'hub_iam_runtime',
    'iam.cancel_application_invitation': 'hub_iam_runtime',
    'iam.revoke_application_grant': 'hub_iam_runtime',
    'iam.application_slug': 'hub_iam_runtime',
  }),
  'identity-access/host-sessions.ts': Object.freeze({
    'iam.open_hub_session': 'hub_iam_runtime',
    'iam.resolve_hub_session': 'hub_iam_runtime',
    'iam.end_hub_session': 'hub_iam_runtime',
    'iam.application_slug': 'hub_iam_runtime',
    'iam.application_by_slug': 'hub_iam_runtime',
    'iam.provision_application_account': 'hub_iam_runtime',
    'iam.claim_application_invitations': 'hub_iam_runtime',
    'iam.mint_application_handoff': 'hub_iam_runtime',
    'iam.open_preview': 'hub_iam_runtime',
    'iam.redeem_handoff': 'hub_iam_runtime',
    'iam.resolve_application_session': 'hub_iam_runtime',
    'iam.resolve_preview_session': 'hub_iam_runtime',
    'iam.end_host_session': 'hub_iam_runtime',
    'iam.record_provider_check': 'hub_iam_runtime',
  }),
  'identity-access/installation-administration.ts': Object.freeze({
    'iam.is_installation_administrator': 'hub_iam_runtime',
    'iam.grant_installation_administrator': 'hub_iam_runtime',
    'iam.revoke_installation_administrator': 'hub_iam_runtime',
    'iam.list_installation_administrators': 'hub_iam_runtime',
    'iam.grant_installation_administrator_by_email': 'hub_iam_runtime',
  }),
  'identity-access/membership.ts': Object.freeze({
    'iam.invite_workspace_member': 'hub_iam_runtime',
    'iam.list_workspace_roster': 'hub_iam_runtime',
    'iam.cancel_workspace_invitation': 'hub_iam_runtime',
    'iam.set_workspace_member_role': 'hub_iam_runtime',
    'iam.remove_workspace_member': 'hub_iam_runtime',
  }),
  'identity-access/store.ts': Object.freeze({
    'iam.email_has_open_invitation': 'hub_iam_runtime',
    'iam.claim_invitations': 'hub_iam_runtime',
    'iam.grant_first_installation_administrator': 'hub_iam_runtime',
  }),
  'identity-access/admission.ts': Object.freeze({
    'iam.lock_administrators': 'hub_command',
  }),
  'project/deletion.ts': Object.freeze({
    'iam.purge_project': 'hub_command',
    'reg.purge_project': 'hub_command',
    'builder.purge_project': 'hub_command',
  }),
  'project/store.ts': Object.freeze({
    'rls.acting_installation_administrator': 'hub_reader',
    'builder.register_project_repository': 'hub_command',
  }),
  'registry/application-artifact-store.ts': Object.freeze({
    'reg.retain_application_execution': 'hub_builder_executor',
    'reg.get_application_by_source': 'hub_builder_executor',
    'reg.read_application_file_by_source': 'hub_builder_executor',
    'reg.retain_application_thumbnail': 'hub_builder_executor',
  }),
  'registry/served-application.ts': Object.freeze({
    'reg.get_served_application': 'hub_reader',
    'reg.read_served_application_file': 'hub_reader',
    'reg.get_application_thumbnail': 'hub_reader',
  }),
})

const sourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = resolve(directory, entry.name)
  return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : []
})

// A database call is `schema.function(` behind a SQL keyword. A TypeScript method call such as
// `workspace.register(app)` has the same shape, so the keyword is what separates them. Arguments
// are counted by balancing parentheses because real call sites nest and carry casts.
const argumentsAt = (text, open) => {
  let depth = 0
  let start = open + 1
  const args = []
  for (let at = open; at < text.length; at += 1) {
    const character = text[at]
    if (character === '(') depth += 1
    else if (character === ')') {
      depth -= 1
      if (depth === 0) {
        const last = text.slice(start, at).trim()
        if (last !== '') args.push(last)
        return args
      }
    } else if (character === ',' && depth === 1) {
      args.push(text.slice(start, at).trim())
      start = at + 1
    }
  }
  return null
}

const CALL_PATTERN = /\b(SELECT|FROM|JOIN)\s+(iam|workspace|project|builder|reg|rls|claude_connection|model_connection)\.([a-z_][a-z0-9_]*)\s*\(/g

export const hubCallSites = () => {
  const found = []
  for (const path of sourceFiles(hubSourceRoot)) {
    const file = path.slice(hubSourceRoot.length + 1).replaceAll('\\', '/')
    const raw = readFileSync(path, 'utf8')
    const lineStarts = [0]
    for (let at = 0; at < raw.length; at += 1) if (raw[at] === '\n') lineStarts.push(at + 1)
    const lineOf = (offset) => {
      let line = 0
      while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) line += 1
      return line + 1
    }
    // Offsets stay usable across a statement broken over several lines by collapsing runs of
    // whitespace to a single space in place rather than removing them.
    const flat = raw.replace(/\s/g, ' ')
    for (const match of flat.matchAll(CALL_PATTERN)) {
      const args = argumentsAt(flat, match.index + match[0].length - 1)
      if (args === null) continue
      found.push({ file, line: lineOf(match.index), name: `${match[2]}.${match[3]}`, arity: args.length })
    }
  }
  return found.sort((left, right) => `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`))
}
