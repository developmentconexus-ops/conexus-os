---
name: conexus-server
description: How an app saves data and runs logic under `conexus/`. Covers operations in `manifest.json`, handlers, reading a Conexão with `connectors.fetch`, tables and migrations, and failures. Use before designing an app's tables or changing anything in `conexus/`.
---

# Server logic and saved data

Everything server-side lives under `conexus/`; the browser app stays in `app/`.

- `manifest.json` declares each operation the browser may call.
- `handlers/*.ts` implement them.
- `migrations/NNN_name.sql` create and change tables, applied in name order before the Preview opens.
  Never edit a migration that has already run; add the next one. Editing one erases this Project's
  Preview data and replays every migration.

## manifest.json

```json
{
  "operations": {
    "listTickets": {
      "handler": "handlers/tickets.ts",
      "export": "listTickets",
      "input": { "type": "object", "properties": { "status": { "type": "string", "enum": ["open", "waiting", "done"] } }, "required": ["status"], "additionalProperties": false },
      "output": { "type": "array", "maxItems": 500, "items": { "type": "object", "properties": { "id": { "type": "integer" }, "subject": { "type": "string" }, "openedAt": { "type": "string" } }, "required": ["id", "subject", "openedAt"], "additionalProperties": false } }
    },
    "changeTicketStatus": {
      "handler": "handlers/tickets.ts",
      "export": "changeTicketStatus",
      "input": { "type": "object", "properties": { "id": { "type": "integer", "minimum": 1 }, "status": { "type": "string", "enum": ["open", "waiting", "done"] }, "note": { "type": "string", "maxLength": 500 } }, "required": ["id", "status", "note"], "additionalProperties": false },
      "output": { "type": "object", "properties": { "id": { "type": "integer" } }, "required": [], "additionalProperties": false }
    }
  }
}
```

A schema uses only the types and keys below. Any other key, such as `pattern`, `format`, `const`,
`description` or `default`, is refused at generate with `unknown key`. Input is always an object. A
value that does not match its schema exactly, including an undeclared field, is refused.

<!-- manifest-schema-keys -->
| type | keys |
| --- | --- |
| `string` | `enum`, `minLength`, `maxLength` |
| `integer` | `minimum`, `maximum` |
| `number` | `minimum`, `maximum` |
| `boolean` | none |
| `object` | `properties`, `required`, `additionalProperties` |
| `array` | `items`, `maxItems` |
<!-- /manifest-schema-keys -->

Every schema also carries `type`. `additionalProperties` on an object is mandatory and must be `false`.

For a field with fixed values, such as a status, declare `"enum"` on a `string`: 1 to 64 distinct
strings of at most 200 characters, and not together with `minLength` or `maxLength`. The typed client
then types the field as a union (`"open" | "closed"`) in the screen and in the handler. Validate again
in the handler only when the rule is more than the list, for example a status that may change only to
the next one.

## Handlers

Type every handler with `Input<'op'>` and `Output<'op'>` from `conexus/types.gen.ts`, which Conexus
generates from the manifest on every check. An object the handler builds with a field the manifest
does not declare, or without one it requires, then fails the type check instead of failing in front
of the person.

```ts
import type { Input, Output } from '../types.gen.ts'

type Db = { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }
type Caller = { accountId: string; email: string | null; displayName: string }
type Connectors = { fetch(request: { connection: string; method: string; path: string; query?: Record<string, string>; body?: unknown }): Promise<{ ok: true; status: number; bytes: number; body: any } | { ok: false; code: string; issues?: string[]; status?: number; vendorStatus?: string }> }

export async function listTickets(input: Input<'listTickets'>, { db }: { db: Db }): Promise<Output<'listTickets'>> {
  const { rows } = await db.query(
    'SELECT id, subject, opened_at AS "openedAt" FROM ticket WHERE status = $1 ORDER BY opened_at DESC LIMIT 500',
    [input.status])
  return rows
}

// The change and its history row are one statement, so neither is saved without the other.
export async function changeTicketStatus(input: Input<'changeTicketStatus'>, { db, caller }: { db: Db; caller: Caller }): Promise<Output<'changeTicketStatus'>> {
  const { rows } = await db.query(
    `WITH changed AS (UPDATE ticket SET status = $2 WHERE id = $1 RETURNING id)
     INSERT INTO ticket_history (ticket_id, status, note, by_account_id, by_name)
     SELECT id, $2, $3, $4, $5 FROM changed RETURNING ticket_id AS id`,
    [input.id, input.status, input.note, caller.accountId, caller.displayName])
  return { id: rows[0]?.id }
}
```

- `caller` is the person using the app, set by Conexus from their sign-in. The browser cannot change
  it. To record who did something, read `caller`; never add a name or author field to the input. In
  the Preview, `caller` is you.
- `connectors` is a third context field when this Project has a Conexão bound.
  `await connectors.fetch({ connection, method, path, query, body })` sends one read to a company
  system, in that system's own request format, through the Conexão bound under the name
  `connection`, one of the names this run's instructions list. `path` is relative to the system's
  own address. It never throws, and answers `{ ok: true, status, bytes, body }` with the system's
  JSON in `body`, or `{ ok: false, code }`. One invocation makes at most 8 calls, and each answer is
  at most 256 KiB. Return only the fields the screen needs, never `body`. The integrator's guide in
  this run's instructions says how to write the request and read the answer.
- Always pass values as parameters (`$1`, `$2`). Tables live in this Project's own schema: do not
  prefix them with a schema name.
- A handler may import only files inside `conexus/` and these `node:` built-ins: `node:assert`,
  `node:assert/strict`, `node:buffer`, `node:crypto`, `node:events`, `node:path`, `node:perf_hooks`,
  `node:querystring`, `node:stream`, `node:stream/promises`, `node:stream/web`, `node:string_decoder`,
  `node:timers`, `node:timers/promises`, `node:url`, `node:util`, `node:util/types` and `node:zlib`. There are no npm packages, no network (`fetch`, `WebSocket` and the like do not exist;
  `connectors.fetch` is the only way to a company system), no file system and no environment
  variables. Each declared `export` must be a function the handler file exports. Each call runs
  isolated for at most 5 seconds and answers at most 1 MiB.
- Postgres `integer` arrives as a number; `bigint` and `numeric` arrive as strings; `timestamptz`
  arrives as an ISO string. Declare decimals as `string` in the output and keep them as text: the
  screen formats them with `lib/format.ts`, and sums belong in SQL. Alias columns to the names the
  output schema declares, for example `created_at AS "createdAt"`.

## Failures

An expected failure is part of the output, and the screen shows it. Nothing found is data: an empty
list or a field left out. A Conexão read that fails is a `failure` field: declare
`"failure": { "type": "string", "maxLength": 40 }` in the output, outside `required`, and when
`connectors.fetch` answers `ok: false`, return the other fields empty with `failure: result.code`.
The screen turns it into a sentence with `failureCodeText` from `@/conexus/failures.gen`. A throw is a bug:
the person sees the failure table's sentence for it, and the failure is recorded.

## Migrations

A record that moves through statuses keeps its history in a table of its own: one row per change,
with who made it and when. `conexus/migrations/001_create_ticket.sql`:

```sql
CREATE TABLE ticket (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  opened_by_account_id uuid NOT NULL,
  opened_by_name text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ticket_history (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id integer NOT NULL REFERENCES ticket (id),
  status text NOT NULL,
  note text NOT NULL,
  by_account_id uuid NOT NULL,
  by_name text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
```

A migration may create and alter tables, indexes, constraints and views in this Project's schema
only: no functions, procedures, triggers, DO blocks, extensions, roles, grants or other schemas.

## The browser side

Conexus generates the browser's typed client from `manifest.json` into `app/src/conexus/api.gen.ts`
on every check. Add or rename a field in the manifest and the type check names every screen and
handler that no longer matches. How a screen calls an operation is in the `conexus-app` skill.
