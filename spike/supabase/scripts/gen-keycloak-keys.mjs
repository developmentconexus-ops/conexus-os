// Stand-in for Keycloak: generates an RS256 key pair and a JWKS document,
// as if it were an OIDC issuer's signing key and its published JWKS.
// No network calls. Writes into ../keys/.
import { generateKeyPairSync, createPrivateKey, createPublicKey } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const kid = 'keycloak-stub-1';

const pubJwk = publicKey.export({ format: 'jwk' });
const jwks = { keys: [{ ...pubJwk, kid, use: 'sig', alg: 'RS256' }] };

writeFileSync('../keys/keycloak-stub-private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
writeFileSync('../keys/keycloak-stub-public.pem', publicKey.export({ type: 'spki', format: 'pem' }));
writeFileSync('../keys/keycloak-stub-jwks.json', JSON.stringify(jwks, null, 2));
writeFileSync('../keys/keycloak-stub-kid.txt', kid);

console.log('wrote keys/keycloak-stub-private.pem, -public.pem, -jwks.json, -kid.txt');
console.log('kid =', kid);
