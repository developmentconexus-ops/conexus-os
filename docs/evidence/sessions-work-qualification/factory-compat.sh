#!/usr/bin/env bash
# Throwaway compatibility probe for @mastra/factory. Installs into a scratch directory
# under /tmp only. Touches no Conexus package.json, lockfile or node_modules.
set -uo pipefail
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
DIR=/tmp/factory-compat
rm -rf "$DIR"; mkdir -p "$DIR"; cd "$DIR"
cat > package.json <<'JSON'
{ "name": "factory-compat-probe", "private": true, "type": "module", "version": "0.0.0" }
JSON
echo "# installing @mastra/factory@0.15.0 with the Conexus core/libsql versions"
npm install --silent --no-audit --no-fund @mastra/factory@0.15.0 @mastra/core@1.67.0 @mastra/libsql@1.23.0 >install.log 2>&1
echo "# npm exit: $?"
tail -5 install.log
echo "# duplicate @mastra/core copies in the tree:"
find node_modules -path '*@mastra/core/package.json' | wc -l
find node_modules -path '*@mastra/core/package.json' -exec node -p "require('./{}').version" \; 2>/dev/null | sort -u
echo "# resolved versions:"
node -p "['@mastra/factory','@mastra/core','@mastra/libsql'].map(n=>n+' '+require(n+'/package.json').version).join('\n')"
