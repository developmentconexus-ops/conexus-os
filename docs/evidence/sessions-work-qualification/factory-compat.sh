#!/usr/bin/env bash
# Throwaway compatibility probe for @mastra/factory. Installs into a fresh scratch directory
# it creates itself, prints the path, and removes nothing it did not create. Touches no
# Conexus package.json, lockfile or node_modules.
#
# Prints the scratch path as the last line, so the Factory probes can be pointed at it:
#   DIR=$(bash factory-compat.sh | tail -1)
set -euo pipefail

CORE=${CONEXUS_CORE_VERSION:-1.67.0}
LIBSQL=${CONEXUS_LIBSQL_VERSION:-1.23.0}
FACTORY=${FACTORY_VERSION:-0.15.0}

DIR=$(mktemp -d "${TMPDIR:-/tmp}/factory-compat-XXXXXXXX")
cd "$DIR"
printf '{ "name": "factory-compat-probe", "private": true, "type": "module", "version": "0.0.0" }\n' > package.json

echo "# scratch:     $DIR" >&2
echo "# installing  @mastra/factory@$FACTORY with @mastra/core@$CORE and @mastra/libsql@$LIBSQL" >&2
npm install --silent --no-audit --no-fund "@mastra/factory@$FACTORY" "@mastra/core@$CORE" "@mastra/libsql@$LIBSQL" >install.log 2>&1

COPIES=$(find node_modules -path '*@mastra/core/package.json' | wc -l)
echo "# @mastra/core copies in the tree: $COPIES" >&2
[ "$COPIES" = "1" ] || { echo "more than one @mastra/core resolved, which is the risk this probe exists to detect" >&2; exit 1; }

node -e "for (const n of ['@mastra/factory','@mastra/core','@mastra/libsql']) console.error('# resolved     ' + n + ' ' + require(n + '/package.json').version)"
echo "$DIR"
