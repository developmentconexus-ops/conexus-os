---
name: conexus-server
description: Use when an app needs server logic, saved data, or browser calls to Project operations.
---

# Server logic and saved data

Read this only when the app must save data or run logic on the server. The browser app stays in `app/`.

Everything server-side lives under `conexus/`:

- `manifest.json` declares each operation the browser may call.
- `handlers/*.ts` implement them.
- `migrations/NNN_name.sql` create and change tables, applied in name order before the Preview opens.
  Never edit a migration that has already run; add the next one. Editing one erases this Project's
  Preview data and replays every migration.

## manifest.json

```json
{
  "operations": {
    "listItems": {
      "handler": "handlers/items.ts",
      "export": "listItems",
      "input": { "type": "object", "properties": { "category": { "type": "string", "maxLength": 80 } }, "required": ["category"], "additionalProperties": false },
      "output": { "type": "array", "maxItems": 500, "items": { "type": "object", "properties": { "id": { "type": "integer" }, "name": { "type": "string" } }, "required": ["id", "name"], "additionalProperties": false } }
    }
  }
}
```

A schema uses only these types: `string` (`minLength`, `maxLength`), `integer` and `number`
(`minimum`, `maximum`), `boolean`, `object` (`properties`, `required`, and `"additionalProperties": false`,
which is mandatory) and `array` (`items`, `maxItems`). Input is always an object. A value that does
not match its schema exactly, including an undeclared field, is refused.

## Handlers

```ts
type Db = { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }
type Caller = { accountId: string; email: string | null; displayName: string }

export async function listItems(input: { category: string }, { db }: { db: Db }) {
  const { rows } = await db.query('SELECT id, name FROM item WHERE category = $1 ORDER BY id', [input.category])
  return rows
}

export async function addItem(input: { name: string }, { db, caller }: { db: Db; caller: Caller }) {
  const { rows } = await db.query(
    'INSERT INTO item (name, created_by_account_id, created_by_name) VALUES ($1, $2, $3) RETURNING id',
    [input.name, caller.accountId, caller.displayName])
  return rows[0]
}
```

- `caller` is the person using the app, set by Conexus from their sign-in. The browser cannot change
  it. To record who did something, read `caller`; never add a name or author field to the input. In
  the Preview, `caller` is you.
- `connectors` may be a third context field: `await connectors.call(operationId, input)` calls one
  operation of an external system this Project has been granted, and never throws. It answers
  `{ ok: true, value }` or `{ ok: false, code }` with a code from a closed list; handle both. The
  operations this Project may call, if any, are named with their id and their input and output shape
  in this run's own instructions. No operation listed there means none exists to call, whatever the
  request asks for.
- Always pass values as parameters (`$1`, `$2`). Tables live in this Project's own schema: do not
  prefix them with a schema name.
- A handler may import only files inside `conexus/` and `node:` built-ins. There are no npm packages,
  no network, no file system and no environment variables. Each call runs isolated for at most 5
  seconds and answers at most 1 MiB.
- Postgres `integer` arrives as a number; `bigint` and `numeric` arrive as strings; `timestamptz`
  arrives as an ISO string. Alias columns to the names the output schema declares, for example
  `created_at AS "createdAt"`.

## Migrations

`conexus/migrations/001_create_item.sql`:

```sql
CREATE TABLE item (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  created_by_account_id uuid NOT NULL,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

A migration may create and alter tables, indexes, constraints and views in this Project's schema
only: no functions, procedures, triggers, DO blocks, extensions, roles, grants or other schemas.

## Calling an operation from the browser

Conexus generates a typed client from `manifest.json` into `app/src/conexus/api.gen.ts` on every
check. Never write or edit it, and never call an operation with `fetch`. Screens use it like this:

```ts
import { api } from '@/conexus/api.gen'

const items = await api.listItems({ category: 'a' }) // typed from the manifest
// a failure throws ConexusError { code, detail }; the screen shows a message and keeps rendering
```

Add or rename a field in the manifest and the type check names every screen and handler that no
longer matches. Handlers can type their signature with the generated `conexus/types.gen.ts`
(`Input<'listItems'>`, `Output<'listItems'>`), plain types a handler may import. How a screen reads, writes and shows errors is in the `conexus-app-code` skill.

When you finish, Conexus checks the result. It type checks `app/` and `conexus/`, builds `app/`, then
validates `manifest.json`, bundles the handlers and lists the migrations, and opens the app in a
browser once with every operation answering the smallest value its output schema admits, so the app
must render with empty data as well as when a call fails. It does not run the handlers or migrations,
so a handler's logic is proven only when the Prévia calls it. A type, build or manifest error refuses
the result. `conexus_check` reports each problem with its file and line. Fix all of them.
