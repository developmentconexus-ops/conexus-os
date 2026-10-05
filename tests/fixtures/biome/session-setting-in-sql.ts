declare const sql: (strings: TemplateStringsArray, ...values: unknown[]) => unknown
declare const client: { query(text: string): unknown }

export const setsTheAccount = sql`SELECT set_config('conexus.account_id', 'x', true)`
export const readsTheScope = sql`SELECT current_setting('conexus.scope', true)`
export const ordinary = sql`SELECT account_id FROM iam.account`
export const switchesTheRole = sql`SET ROLE hub_command`
export const switchesTheSessionRole = sql`set session role hub_command`
export const resetsTheRole = sql`RESET ROLE`
export const switchesTheAuthorization = sql`SET SESSION AUTHORIZATION postgres`
export const spacedBeforeTheDot = sql`set local conexus .job = 'project-purge'`
export const plainTemplate = client.query(`SET LOCAL ROLE hub_command`)
export const plainString = client.query('SET ROLE hub_command')
export const stringSettingConfig = client.query("SELECT set_config('role', 'hub_command', true)")
export const harmlessString = client.query('SELECT 1')
export const roleColumn = sql`SELECT role FROM iam.workspace_membership`
