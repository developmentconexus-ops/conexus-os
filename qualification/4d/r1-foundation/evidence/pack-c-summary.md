# R1 Foundation Pack C summary

Status: **PASS / P05+P06+P07 GREEN / REAL LOCAL KEYCLOAK+POSTGRESQL**

Fastify used one sealed strict non-mutating Ajv compiler over an exact generated
fixture-route census. Coercion, defaults, additional-field removal, fallback
compiler installation and ungenerated routes all failed.

Keycloak `26.7.2` executed from the exact admitted parent manifest through a
qualification-only `kc.sh build` cache. A real confidential Authorization Code
flow used PKCE S256, state and nonce. Wrong state/callback issuer/nonce/PKCE/
redirect and forged ID-token issuer/audience/signature all failed. The signature
case fetched the real realm JWKS. A deliberate negative-of-the-probe showed the
forged signature would pass without `enableNonRepudiationChecks`, proving that
the selected hook is necessary. The synthetic Keycloak `admin` role still
granted no Conexus authority without current Conexus grant truth.

PostgreSQL `17.10` stored only a SHA-256 digest of a 256-bit opaque session id.
Rotation, idle/absolute expiry, EndSession, Account revocation, one-shot exact-
subject bootstrap, cross-Workspace and Control/App separation all failed closed.
Secrets entered the harness through temporary restrictive WSL files and were
redacted from diagnostics.

All containers, databases, realm state, credentials, temporary installs and
listeners were removed. Only exact local image caches remain, with removal
commands recorded. This is qualification harness code, not Product implementation.
