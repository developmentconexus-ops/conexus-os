// Signs one RS256 JWT per claims/*.json file (stand-in Keycloak tokens),
// writes tokens/<name>.jwt. No deps, no network.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createSign } from 'node:crypto';

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const kid = readFileSync('/scripts/keys/keycloak-stub-kid.txt', 'utf8').trim();
const privateKey = readFileSync('/scripts/keys/keycloak-stub-private.pem', 'utf8');

mkdirSync('/scripts/tokens', { recursive: true });

for (const file of readdirSync('/scripts/claims')) {
  if (!file.endsWith('.json')) continue;
  const claims = JSON.parse(readFileSync(`/scripts/claims/${file}`, 'utf8'));
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now, exp: now + 3600, ...claims };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  const jwt = `${signingInput}.${signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  const name = file.replace(/\.json$/, '');
  writeFileSync(`/scripts/tokens/${name}.jwt`, jwt);
  console.log(name, '->', jwt.slice(0, 20) + '...');
}
