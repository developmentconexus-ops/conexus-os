declare const sql: (strings: TemplateStringsArray, ...values: unknown[]) => unknown

export const setsTheAccount = sql`SELECT set_config('conexus.account_id', 'x', true)`
export const readsTheScope = sql`SELECT current_setting('conexus.scope', true)`
export const ordinary = sql`SELECT account_id FROM iam.account`
