// Signs an RS256 JWT with the stand-in "Keycloak" private key, from a JSON
// claims file given as argv[2]. No network calls, no dependencies.
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const claimsPath = process.argv[2];
if (!claimsPath) {
  console.error('usage: node sign-jwt.mjs <claims.json>');
  process.exit(1);
}

const kid = readFileSync('../keys/keycloak-stub-kid.txt', 'utf8').trim();
const privateKey = readFileSync('../keys/keycloak-stub-private.pem', 'utf8');
const claims = JSON.parse(readFileSync(claimsPath, 'utf8'));

const header = { alg: 'RS256', typ: 'JWT', kid };
const now = Math.floor(Date.now() / 1000);
const payload = { iat: now, exp: now + 3600, ...claims };

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);
const jwt = `${signingInput}.${signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

console.log(jwt);
