#!/usr/bin/env bash
set -euo pipefail

mkdir -p /work/root /work/secrets
cp /source/package.json /source/package-lock.json /source/.npmrc /work/root/
cp -r /source/browser-foundation /work/root/
cd /work/root
node /opt/npm-12/bin/npm-cli.js ci --strict-allow-scripts --registry=https://registry.npmjs.org/ >/dev/null

openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj '/CN=127.0.0.1' \
  -addext 'subjectAltName=IP:127.0.0.1' \
  -keyout /work/secrets/key.pem \
  -out /work/secrets/cert.pem >/dev/null 2>&1
chmod 0600 /work/secrets/key.pem

cd /work/root/browser-foundation
R1F_SERVER_SECRET='r1f-server-secret-sentinel-never-bundle' \
VITE_PUBLIC_LABEL='R1 Public Fixture' \
node /work/root/node_modules/vite/bin/vite.js build

R1F_SERVER_SECRET='r1f-server-secret-sentinel-never-bundle' \
VITE_PUBLIC_LABEL='R1 Public Fixture' \
node verify-build.mjs

R1F_CERT_FILE=/work/secrets/cert.pem \
R1F_KEY_FILE=/work/secrets/key.pem \
R1F_SERVER_SECRET='r1f-server-secret-sentinel-never-bundle' \
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
node /work/root/node_modules/@playwright/test/cli.js test --config=playwright.config.mjs

printf 'pack-d=PASS\ncleanup=pending-container-removal\n'
