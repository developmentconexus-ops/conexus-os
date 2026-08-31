# 4D OPP-C08 — SaaS/Private Reachability and DEDICATED Deployment Study

> **Status:** `PASS 1 OPERATOR APPROVED / DEDICATED CONTRACT CONFIRMED + SCF-08 ENRICHED / PRIVATE REACHABILITY COMPOUND-TRIGGER DEFERRED`
> **Inputs:** C-003/C-005/C-007/C-014/C-015/C-016; Project/Security/I&A/Connections/Gateway/Release/operations owners; B06/B07; SCF-08
> **Research date:** `2026-08-29`
> **Live customer topology/deployment/provider execution:** `NOT PERFORMED / REAL CONSUMER REQUIRED`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

Which future-facing deployment and private-reachability properties should be
preserved now without confusing two independent requirement classes or selecting
a tunnel, network fabric, customer runtime or workload-identity platform?

## 2. Two orthogonal requirement classes

### DEDICATED

```text
one Project / one Factory / one Change-Builder-Release lifecycle
+ ApplicationRuntimeProfile = DEDICATED
→ independently executable Project runtime/data plane
→ Product-specific customer networking
→ explicit Conexus Platform Service bindings only
```

DEDICATED can exist without SaaS private-source reachability. The application may
run privately, publicly or in a customer cloud according to its Product and
customer topology.

### SaaS → private/on-prem target

```text
SaaS Conexus selected
+ real enterprise target reachable only privately/on-prem
→ decide authenticated reachability/custody topology
```

This can exist for a MANAGED Project and is not a DEDICATED deployment feature.
Neither requirement authorizes the other or proves a shared agent/tunnel.

## 3. Current DEDICATED semantic/trust contract

Current accepted semantics remain:

```text
principal              = DedicatedApplicationPrincipal
client authentication  = private_key_jwt
signed assertion binds = exact server-validated ReleaseRef
access token           = short-lived bearer
F1 projection          = SERVICE_SCOPED only
every request           = credentialGeneration + Project/Release containment
                          + Release-pinned service composition
                          + current owner/security gates
```

DEDICATED owns its application runtime, business data, backups and Product-
specific network behavior. It inherits no Connection, Gateway, Hub, Vault,
Project-DB or DEDICATED-private-key credential. Conexus-owned capabilities are
available only through explicit Platform Service bindings.

No concrete DEDICATED operation, key/principal lifecycle record, token endpoint,
physical host or deployment activation is admitted without the first real
application consumer. Human Keycloak/OIDC identity must never be reused as the
machine principal.

## 4. Stable DEDICATED exchange envelope

The stable seam is exact composition/custody, not an orchestrator:

```text
exact ReleaseRef
+ immutable OCI/native artifact digest set
+ target OS/architecture/runtime compatibility
+ configContractDigest + non-secret defaults/schema
+ schema/migration compatibility claims
+ Platform Service protocol compatibility range
+ signature/provenance/SBOM Evidence refs
+ install/upgrade/rollback procedure identity
```

Artifact possession, signature or local installation grants no Platform Service
authority and is not activation or `SERVED_VERIFIED`. Mutable tags, `latest`,
customer rebuilds or chart/local overrides cannot preserve the same Release
identity when deciding bytes/config change.

Offline artifact delivery is compatible with DEDICATED. Offline use of Conexus
Platform Services is not: token issuance and every-request current checks require
reachability. A consumer demanding autonomous offline Platform Service authority
is an upstream trust-contract falsifier, not an installer option.

## 5. DEDICATED deployment mechanisms

The current B07 three-plane law remains owner; C08 does not reselect it.

| Candidate | Valid first-consumer shape | Current disposition |
| --- | --- | --- |
| Native immutable bundle + systemd | smallest single customer-VM/service footprint | real-consumer challenger |
| OCI image + Compose | portable digest-pinned one-VM multi-service deployment | strong one-VM hypothesis |
| OCI + systemd/Podman/Quadlet | OCI portability with customer systemd custody | strategic challenger |
| Kubernetes manifests | customer already owns compatible cluster/HA/policy need | cluster-triggered challenger |
| Helm | Kubernetes packaging/history only | Kubernetes-conditional packaging challenger |
| Appliance/VM image | tightly controlled/disconnected support estate | OS/hypervisor/support trigger |
| Customer source build | supplemental inspection only | reject as default admitted exchange |

Compose health, systemd active, Kubernetes Ready or Helm success remains
deployment observation. None is Project Release/Promotion/serving truth. Helm
rollback does not roll back business data; Kubernetes NetworkPolicy without an
enforcing implementation proves nothing.

## 6. DEDICATED authentication and sender constraint

`private_key_jwt` remains a sound client-authentication seam. Exact key
registration, algorithms, assertion lifetime, `jti` replay handling, rotation
overlap and failure recovery remain first-consumer activation decisions.

Material caveat:

```text
private_key_jwt authenticates token request
!= sender-constrained resulting bearer token
```

The current deferral of mTLS/DPoP remains valid now, but cannot become an
unconditional prohibition. The first real threat model must either:

1. prove ordinary TLS plus very short-lived, audience/action-restricted bearer
   is proportionate, with explicit residual-risk acceptance; or
2. compare mTLS and DPoP and reopen only the narrow token-transport decision.

SPIFFE/SPIRE becomes relevant only for a real dynamic multi-workload/customer-
cluster trust-domain problem. It may authenticate workloads beneath Conexus but
can never replace `DedicatedApplicationPrincipal`, `ReleaseRef`,
`credentialGeneration` or SERVICE_SCOPED authorization.

## 7. DEDICATED custody and lifecycle

```text
Conexus custody:
  ReleaseManifest/artifact digests
  verification/trust policy
  Platform Service endpoints/authorization
  public-key generations and current binding/composition gates

customer custody:
  host/cluster and Product ingress/network policy
  DEDICATED private key
  deployment overlays
  business data/backups/restore
  local logs/retention unless explicitly exported

never in image/chart/repository/log:
  private signing key
  Connection/Hub/Vault/DB credentials
  customer secret values
```

Install and activate remain separate. Upgrade/rollback must retain exact old/new
Release identities, verify host/runtime/API/config/schema compatibility and
perform a real served/exchange probe. Revocation is request-time authority; it
cannot depend on uninstalling software or deleting an image from a registry.

## 8. SaaS/private reachability logical protocol

No current SaaS/private consumer exists. If the compound trigger fires, the
strongest default hypothesis is a customer-hosted, outbound-initiated,
application-scoped connector/relay—not a generic routed network:

```text
SaaS owner admission
→ signed short-lived tenant/installation/capability envelope
→ replaceable rendezvous/transport
→ customer connector with local logical-target mapping
→ exact private system adapter
→ typed receipt/result
```

The SaaS never supplies arbitrary host/IP/port, credential or unrestricted
payload. Customer-local configuration maps `logicalTargetId + operation` to an
allowlisted destination. The connector offers no SOCKS, shell, generic TCP
forward, arbitrary fetch or route advertisement.

Transport reconnect is not retry/replay. Delivery states remain distinct:

```text
NOT_DELIVERED
DELIVERED_NOT_STARTED
STARTED_OUTCOME_UNKNOWN
COMPLETED
```

Existing Gateway effect identity/reconciliation remains mandatory for effects.
Connector/broker/queue status cannot manufacture owner truth.

This is a leading protocol shape, not a mandated product. A customer-standard
private endpoint, VPN or network fabric may carry the same exact application-
level protocol when topology/custody/operations make it superior.

## 9. Reachability transport candidates

### Cloudflare Tunnel

Strong outbound-only hostname/service transport with connector replicas and
managed edge. Private CIDR routing and Cloudflare data/control-plane custody can
widen scope and create material vendor/residency dependencies.

**Disposition:** `MANAGED OUTBOUND TRANSPORT CHALLENGER`.

### Tailscale / WireGuard

Strong encrypted mesh/subnet/app-connector mechanics, direct paths with relay
fallback and customer-friendly deployment. Subnet routing/ACLs remain network-
level and the coordination plane owns node/key/route policy distribution.

**Disposition:** `CUSTOMER-MANAGED NETWORK CHALLENGER`; WireGuard alone is a
substrate, not identity/custody/operation semantics.

### Twingate / OpenZiti / Boundary

Twingate provides commercial outbound Connectors and resource-scoped access.
OpenZiti offers self-hosted service identities/policies with much greater PKI/
controller/router operations. Boundary demonstrates outbound private workers
and target/session binding, but is an access broker rather than durable machine
execution.

**Disposition:** `COMMERCIAL / SOVEREIGN / PATTERN CHALLENGERS`.

### Site-to-site VPN

VPN/IPsec is credible when a customer already standardizes it, but imports broad
CIDR routing, overlapping-address and bilateral HA/firewall/BGP operations.

**Disposition:** `REJECT AS DEFAULT / CUSTOMER-STANDARD TRIGGER ONLY`.

### AWS/Azure/GCP private service endpoints

PrivateLink, Private Link and Private Service Connect provide strong per-service
cloud-private connectivity, approval and tenant/account/project scoping. On-prem
reach still requires hybrid networking, and the choice strongly binds region/
cloud/topology.

**Disposition:** `PREMIUM SAME-CLOUD TRANSPORT CHALLENGERS`.

### Dedicated private circuits

Direct Connect/ExpressRoute/Interconnect may serve extreme regulatory,
throughput/latency or deterministic-custody requirements, with major cost,
lead-time and redundant-carrier/BGP obligations.

**Disposition:** `EXTREME-REQUIREMENT SEAM ONLY`.

## 10. Transport-neutral safety properties at the future trigger

1. connectivity never authenticates/authorizes a Conexus operation;
2. exact tenant + installation + connector instance + key generation identity;
3. logical target/operation confinement; no caller-supplied network destination;
4. local customer kill switch and deny-by-default mapping;
5. connector credential distinct from target-system credential;
6. signed, expiring, nonce/idempotency-bound request envelope and typed receipt;
7. explicit delivery/outcome states; reconnect never replays by implication;
8. fencing/lease for HA connector duplicates;
9. signed/provenanced, staged, rollback-capable customer-controlled updates;
10. exact data/metadata/key/log custody, residency and minimization inventory;
11. transport replaceability under one application protocol/owner envelope;
12. provider/network outage cannot widen cached authorization or fabricate success.

These are first-trigger proof inputs, not a new Reachability Product owner.

## 11. Ledger adjudication

`SCF-08` remains `PRESERVE_SEAM`. It is enriched only with the already-current
DEDICATED trust/exchange facts and first-consumer falsifiers:

- one profile/Factory;
- exact Release-bound machine principal and short-lived service projection;
- every-request current-generation/containment checks;
- immutable deployment exchange grants no authority;
- offline artifact delivery does not imply offline capability use;
- physical deployment and sender-constraint selection wait for the real consumer.

No new `AUT`, `INT`, `REL`, `CON` or reachability row is justified. SaaS/private
reachability remains `DEFER WITH COMPOUND TRIGGER`; its future decision reuses
Project/Connections/Gateway/security/operations owners.

## 12. Required falsifiers

1. `C08-P1`: DEDICATED profile cannot create a second Factory, automatic conversion or independent Release authority.
2. `C08-P2`: mutable tag/local rebuild/chart override cannot stand for exact ReleaseRef/config identity.
3. `C08-P3`: artifact/signature/host possession cannot grant Platform Service access or serving truth.
4. `C08-P4`: Connection/Hub/Vault/Project-DB/private-key credential cannot enter image/chart/repository/log or be inherited.
5. `C08-P5`: stale/revoked credential generation, wrong Project/Release/service or mutable latest is denied on every request.
6. `C08-P6`: fully offline runtime cannot claim current Platform Service capability use.
7. `C08-P7`: rollback cannot reactivate an incompatible runtime/schema/config or perform implicit down migration.
8. `C08-P8`: revocation cannot depend on uninstall/registry deletion.
9. `C08-P9`: first-consumer bearer leakage threat either passes explicit bounded proof or triggers mTLS/DPoP comparison.
10. `C08-P10`: SPIFFE/mTLS/network identity cannot replace Conexus principal/Release/authorization.
11. `C08-P11`: Kubernetes/Helm cannot be forced onto one VM and Compose/systemd cannot be forced onto a governed cluster.
12. `C08-P12`: DEDICATED packaging cannot silently create SaaS/private tunnel or unsolicited Conexus→customer control.
13. `C08-P13`: SaaS/private mechanism cannot be admitted before both SaaS and real private-target triggers.
14. `C08-P14`: tenant-A envelope/connector/key is denied before tenant-B target resolution.
15. `C08-P15`: DNS rebinding/CNAME/redirect/IPv6/link-local/metadata/arbitrary-port attempts cannot escape logical target policy.
16. `C08-P16`: duplicate delivery/reconnect/broker retry and two HA connectors produce no duplicate material effect.
17. `C08-P17`: disconnect preserves exact delivery/outcome unknowns; timeout cannot become success or rollback.
18. `C08-P18`: cached policy/key during control-plane outage cannot outlive admitted TTL/revocation risk.
19. `C08-P19`: same logical protocol over relay/private-endpoint/customer VPN preserves authorization, custody and receipt semantics.
20. `C08-P20`: tunnel/VPN/private-endpoint availability cannot become Connection qualification, authorization or Release proof.

## 13. Current primary sources

- [RFC 7523 JWT client authentication](https://www.rfc-editor.org/rfc/rfc7523),
  [OAuth Security BCP RFC 9700](https://www.rfc-editor.org/rfc/rfc9700),
  [mTLS RFC 8705](https://www.rfc-editor.org/rfc/rfc8705) and
  [DPoP RFC 9449](https://www.rfc-editor.org/rfc/rfc9449);
- [OCI image descriptor](https://github.com/opencontainers/image-spec/blob/main/descriptor.md),
  [Compose production](https://docs.docker.com/compose/how-tos/production/),
  [Kubernetes image digests](https://kubernetes.io/docs/concepts/containers/images/)
  and [systemd credentials](https://github.com/systemd/systemd/blob/main/docs/CREDENTIALS.md);
- [SPIFFE concepts](https://spiffe.io/docs/latest/spiffe/concepts/) and
  [Workload API](https://spiffe.io/docs/latest/spiffe-specs/spiffe_workload_api/);
- [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/),
  [Tailscale control/data planes](https://tailscale.com/docs/concepts/control-data-planes),
  [Twingate flow](https://www.twingate.com/docs/detailed-client-connection-flow),
  [OpenZiti services](https://openziti.io/docs/learn/core-concepts/services/overview)
  and [Boundary workers](https://developer.hashicorp.com/boundary/docs/workers/multi-hop);
- [AWS PrivateLink](https://docs.aws.amazon.com/vpc/latest/privatelink/concepts.html),
  [Azure Private Link](https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-overview)
  and [GCP Private Service Connect](https://docs.cloud.google.com/vpc/docs/private-service-connect).

## 14. Independent challenge and adjudication

Three fresh reviewers independently reconstructed current owners, SaaS/private
transport candidates and DEDICATED deployment/exchange alternatives. Lead
accepted the material corrections: DEDICATED and SaaS/private are orthogonal;
the outbound application relay is a leading future default, not a universal
mandate; and the present “no mTLS/DPoP” wording is a deferral, not permission to
ignore bearer sender-constraint risk at the first real activation.

No reviewer selected a mechanism or found a need for a new Product operation,
Permission, owner, record or trust zone.

## 15. Pass-1 outcome

```text
OPP-C08 PASS 1 = OPERATOR APPROVED
DEDICATED and SaaS/private reachability = ORTHOGONAL REQUIREMENT CLASSES
current DEDICATED semantic/trust contract = CONFIRMED
SCF-08 = ENRICHED / PRESERVE_SEAM
DEDICATED physical deployment = FIRST REAL CONSUMER ONLY
immutable Release-bound deployment exchange envelope = PRESERVE
offline artifact delivery != offline Platform Service capability use
private_key_jwt = CURRENT CLIENT-AUTH SEAM
mTLS/DPoP = FIRST-CONSUMER SENDER-CONSTRAINT CHALLENGERS IF THREAT MODEL FIRES
SPIFFE/SPIRE = FLEET/TRUST-DOMAIN TRIGGER ONLY
OCI/Compose/systemd/Quadlet/Kubernetes/Helm = FIRST-CONSUMER DEPLOYMENT CHALLENGERS
SaaS→private/on-prem reachability = DEFER WITH COMPOUND REAL-TOPOLOGY TRIGGER
outbound application-scoped connector/relay = LEADING FUTURE DEFAULT HYPOTHESIS
Cloudflare/Tailscale/Twingate/OpenZiti/Boundary = TRANSPORT/PATTERN CHALLENGERS
site-to-site VPN = REJECT AS DEFAULT / CUSTOMER-STANDARD TRIGGER
cloud private endpoints = PREMIUM SAME-CLOUD CHALLENGERS
new ledger IDs = 0 / SCF-08 REFINED
new Product owner/operation/Permission/record/trust zone = 0
exact deployment/reachability/identity mechanism/version = 0
Product implementation authority = 0
```
