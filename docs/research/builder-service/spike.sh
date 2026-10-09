#!/usr/bin/env bash
# Builder service spikes for the Builder service study (study.md, section 6). Needs Docker and `npm ci`.
# Run from the repository root: bash docs/research/builder-service/spike.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
PG='postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'
probe=$(mktemp -p . mastra-probe-XXXX.mjs)
trap 'docker rm -f spike-builder >/dev/null 2>&1; rm -f "$probe"' EXIT
docker rm -f spike-builder >/dev/null 2>&1
docker run -d --name spike-builder -p 127.0.0.1:55436:5432 -e POSTGRES_PASSWORD=spike-only "$PG" >/dev/null
until docker exec spike-builder pg_isready -U postgres -q 2>/dev/null; do sleep 1; done; sleep 2

echo 'B1 the tables the Builder'"'"'s Mastra store creates in the Hub database (apps/hub/src/builder/storage.ts)'
cat > "$probe" <<'JS'
import pg from 'pg'
import { PostgresStore } from '@mastra/pg'
const pool = new pg.Pool({ connectionString: process.argv[2] })
const store = new PostgresStore({ id: 'probe', pool, schemaName: 'factory' })
await store.init()
const { rows } = await pool.query("select table_name from information_schema.tables where table_schema = 'factory' order by 1")
console.log(`  ${rows.length} tables: ${rows.map((row) => row.table_name).join(' ')}`)
await pool.end()
JS
node "$probe" 'postgresql://postgres:spike-only@127.0.0.1:55436/postgres'
