#!/usr/bin/env bash
set -euo pipefail

for tree in /work/tree1 /work/tree2; do
  mkdir -p "$tree"
  cp /source/package.json /source/package-lock.json /source/.npmrc "$tree/"
  cp -r /source/admission /source/gates "$tree/"
  cd "$tree"
  node /opt/npm-12/bin/npm-cli.js ci --strict-allow-scripts --registry=https://registry.npmjs.org/ >/dev/null
done

node /source/admission/inventory-tree.mjs /work/tree1/node_modules > /work/tree1.inventory.json
node /source/admission/inventory-tree.mjs /work/tree2/node_modules > /work/tree2.inventory.json
cmp /work/tree1.inventory.json /work/tree2.inventory.json
grep '5f276d1cfa0f6c1b199230c9bf5553ca98fa9a8ebe5ca7d6477dcc7decf9ec57' /work/tree1.inventory.json >/dev/null

node /source/gates/pack-f/optional-native-report.mjs /work/tree1/package-lock.json /work/tree1/node_modules > /work/optional-native.json
node -e "const r=require('/work/optional-native.json'); console.log(JSON.stringify({kind:r.kind,optionalLocked:r.optionalLocked,absentOnLinuxX64:r.absentOnLinuxX64,windowsCandidates:r.windowsCandidates,darwinCandidates:r.darwinCandidates,linuxInstalled:r.linuxInstalled,authority:r.authority},null,2))"
node /work/tree1/gates/pack-f/run-gates.mjs /work/tree1

printf 'pack-f=PASS\ncleanup=pending-container-removal\n'
