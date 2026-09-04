# 4D — R1 Foundation Pack C HTTP/identity/session result

Status: **CLOSED / PACK C PASS / `R1F-P05/P06/P07` GREEN / OTHER PACKS NOT PROVEN**

Date: `2026-08-30`

Pack C executed only local synthetic state under the operator-approved probe
grant. It used exact admitted Fastify/openid-client/pg packages, Keycloak
`26.7.2` parent image and PostgreSQL `17.10` image manifests.
[Executable Evidence](../../../qualification/4d/r1-foundation/evidence/pack-c-summary.md).

## Result

| Proof | Verdict | Real substrate and deciding observation |
| --- | --- | --- |
| `R1F-P05` | `PASS` | Fastify inject: exact two-route census, one Ajv compiler, mutation/fallback negatives fired |
| `R1F-P06` | `PASS` | real Keycloak form → Authorization Code → PKCE/state/nonce → openid-client; all named forged/redirect negatives fired |
| `R1F-P07` | `PASS` | real PostgreSQL session/bootstrap/grant records; rotation/expiry/revocation/surface/secret negatives fired |

Examples:

```text
Keycloak role = admin
Conexus current grant = absent
→ DENY

browser session token = 256-bit opaque value
PostgreSQL = SHA-256 digest only
→ raw token never becomes durable session truth

callback ID-token signature altered
→ real realm JWKS verification
→ DENY
```

The probe exposed and corrected one harness requirement: `openid-client` v6
needs `enableNonRepudiationChecks` for application-level ID-token signature
verification. A deliberate negative proved the forged signature is otherwise
accepted after claim validation, so this hook is a required R1 invariant rather
than optional hardening.

## Claim boundary

The harness does not implement the Product Hub, production realm/database,
browser cookies/CSRF, HA/restart/recovery, global Keycloak logout or Product
authorization. It proves only the named mechanics and separation properties.

All containers and synthetic state were destroyed. Exact image caches remain
locally with recorded removal commands. Product implementation, push, PR and
merge remain unauthorized.
