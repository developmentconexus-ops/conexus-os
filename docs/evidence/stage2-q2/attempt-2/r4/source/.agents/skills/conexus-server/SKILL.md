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

export async function listItems(input: { category: string }, { db }: { db: Db }) {
  const { rows } = await db.query('SELECT id, name FROM item WHERE category = $1 ORDER BY id', [input.category])
  return rows
}
```

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
  created_at timestamptz NOT NULL DEFAULT now()
);
```

A migration may create and alter tables, indexes, constraints and views in this Project's schema
only: no functions, procedures, triggers, DO blocks, extensions, roles, grants or other schemas.

## Calling an operation from the browser

```ts
const response = await fetch('/__conexus/api/listItems', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ category: 'a' }),
})
if (!response.ok) {
  const { error } = await response.json() // { code, detail? }
  // show the failure; the app must keep rendering
} else {
  const items = await response.json()
}
```

The build check answers every operation with the smallest value its output schema admits, so the
app must render with empty data as well as when a call fails.

`sh conexus/check.sh` builds `app/`, then validates `manifest.json`, bundles the handlers and lists
the migrations. Fix whatever it reports.
