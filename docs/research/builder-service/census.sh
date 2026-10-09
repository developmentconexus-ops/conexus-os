#!/usr/bin/env bash
# Builder census: what of the Builder runs in the Hub process, and what it keeps where.
# Rerun from the root of any checkout: bash docs/research/builder-service/census.sh
set -euo pipefail
cd "${CONEXUS_OS:-$(git rev-parse --show-toplevel)}"  # CONEXUS_OS: a conexus-os checkout, when run from elsewhere
b='apps/hub/src/builder'
line() { printf '\n## %s  [%s]\n' "$1" "$(printf '%s' "$2" | grep -c . || true)"; printf '%s\n' "$2" | sed '/^$/d'; }

line 'C1 Builder source files and lines' "$(find "$b" -name '*.ts' | sort)"
echo "   lines: $(find "$b" -name '*.ts' -print0 | xargs -0 cat | wc -l | tr -d ' ')"
line 'C2 imports from other Hub modules into the Builder' \
  "$(grep -rhoE "from '\.\./(identity-access|workspace|project|connectors|registry|hosting|app-runner|telemetry)[^']*'" "$b" | sort | uniq -c | sort -rn)"
line 'C3 imports of the Builder from other Hub modules' \
  "$(grep -rlE "from '(\.\./)+builder/" apps/hub/src --include='*.ts' | grep -v "^$b/" | sort)"
line 'C4 Mastra packages the Builder imports' "$(grep -rhoE "from '@mastra/[a-z-]+(/[a-z-]+)?'" "$b" | sort | uniq -c | sort -rn)"
line 'C5 the Mastra instance, its store and the controller' \
  "$(grep -rn -e 'new Mastra(' -e 'new PostgresStore(' -e 'createCodingAgent(' -e 'new AgentController(' "$b" --include='*.ts')"
line 'C6 jobs the Builder runs in the Hub process' "$(grep -rn "everyMs: " "$b" --include='*.ts')"
line 'C7 Builder state Conexus owns in the Hub database (schema builder)' \
  "$(grep -hoE 'CREATE TABLE (IF NOT EXISTS )?builder\.[a-z_]+' apps/hub/migrations/*.sql | awk '{print $NF}' | sort -u)"
line 'C8 Builder inputs that are host-local (files, sockets, binaries, roots)' \
  "$(grep -rhoE "CONEXUS_(GIT_ROOT|COMPILE_ROOT|CLIPROXY_BIN|BUILDER_[A-Z0-9_]+)" apps/hub/src | sort -u)"
line 'C9 raw tool results kept in Mastra messages (boundary item 12)' \
  "$(grep -n "keep the raw arguments and result" docs/reference/mastra/boundary.md || true)"
