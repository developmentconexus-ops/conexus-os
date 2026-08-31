# 4D OPP-B01 — Backend Router and Module-Boundary Study

> **Status:** `PASS 1 OPERATOR APPROVED / FASTIFY LEADING CANDIDATE / NO PACKAGE SELECTION`
> **Inputs:** Node/TypeScript modular-monolith authority; 4B wire; `WIR-01..05`; `AUT-01..06`; `VER-01..04`
> **Research date:** `2026-08-28`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

> Which Node/TypeScript HTTP mechanism best realizes exact generated Product and
> Technical-Ingress routes, request/current-authority context, Problems,
> OIDC/SSE, lifecycle and testing without becoming a semantic module boundary,
> second schema authority or universal mediator?

## 2. Required Conexus structure

```text
composition root
├── exact seven L7 flows only
├── owner modules / application services
├── narrow infrastructure adapters
└── HTTP composition
    ├── generated Product route bindings from canonical 4B wire
    ├── separately generated/declared Technical Ingress bindings
    ├── request/session/current-authority resolution
    ├── owner-specific handler dispatch
    └── exact Problem/response projection
```

The router owns only HTTP mechanics. It does not own:

- semantic modules or their dependency graph;
- authentication/authorization truth;
- operation meaning or DTO schemas;
- transaction boundaries;
- Gateway/Release/PAR/MAR lifecycle;
- runtime terminal truth;
- a generic command/query bus.

Framework plugin/module/DI boundaries are not security or Product-owner
boundaries merely because the framework names them.

## 3. Current sources and identity

Context7 resolved and queried high-reputation official sources for Fastify, Hono
and NestJS. Express/Node behavior was checked from current official docs.

Primary sources:

- [Fastify reference](https://fastify.dev/docs/latest/Reference/)
- [Fastify lifecycle](https://fastify.dev/docs/latest/Reference/Lifecycle/)
- [Fastify validation/serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Hono Node.js guide](https://hono.dev/docs/getting-started/nodejs)
- [Hono Web Standards](https://hono.dev/docs/concepts/web-standard)
- [Hono SSE](https://hono.dev/docs/helpers/streaming#streaming-helper)
- [NestJS documentation](https://docs.nestjs.com/)
- [Express error handling](https://expressjs.com/en/5x/guide/error-handling/)
- [Express health/shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown/)

Registry observations are Evidence, not pins:

| Package | Observed version | License | Observation |
| --- | --- | --- | --- |
| `fastify` | `5.12.1` | MIT | integrated lifecycle, plugin encapsulation, logging, AJV/compiler and injection testing |
| `@fastify/sse` | `0.6.0` | MIT | current Fastify 5 SSE plugin; exact replay/projection fit remains unproved |
| `hono` | `4.13.5` | MIT | small Web Standards router with no runtime dependencies in current package metadata |
| `@hono/node-server` | `2.1.1` | MIT | Node adapter and raw Node bindings |
| `@hono/zod-openapi` | `1.6.1` | MIT | would make Zod/OpenAPI generation a competing authority if used canonically |
| `express` | `5.2.1` | MIT | mature middleware/router baseline with manual validation/lifecycle composition |
| `@nestjs/core` | `12.0.1` | MIT | module/DI/decorator framework with RxJS and adapter ecosystem |
| `@nestjs/platform-fastify` | `12.0.1` | MIT | adds Nest machinery over Fastify rather than reducing the decision surface |

## 4. Cross-cutting laws before comparison

### Wire/schema custody

```text
canonical OpenAPI 3.1 + JSON Schema 2020-12
→ generated route/transport/validation projection
→ router adapter

-X-> framework decorators/classes/Zod schemas becoming canonical
-X-> framework route schema copied by hand
-X-> runtime coercion/defaulting/removal changing admitted request bytes silently
```

### Request authority

Request context may carry resolved current/pinned facts and correlation, but raw
framework context/decorators/locals never grant authority. Every protected
operation still calls the exact owner and rechecks current truth at its control
point.

### Module boundaries

TypeScript imports, composition wiring, DB capabilities and tests enforce the
closed owner graph. Router plugins/modules/providers may organize code but do
not redefine that graph.

## 5. Candidate analysis

### A — Fastify

Useful properties:

- plugin encapsulation supports scoped route/hook/decorator composition;
- complete request lifecycle hooks provide explicit auth/context, validation,
  handler, serialization, error and observation points;
- `ready()`/`close()` and preClose/onClose lifecycle support startup/shutdown;
- `inject()` provides mature no-port HTTP integration tests;
- custom validator/serializer compilers and schema controllers are supported;
- native logging integration can remain correlation-only;
- maintained SSE plugin exists for Fastify 5.

Material gaps/risks:

- default schema examples/behavior are Draft 7 oriented while Conexus canonical
  schemas are OpenAPI 3.1 / JSON Schema 2020-12;
- default AJV settings coerce array types, apply defaults and remove additional
  properties, silently mutating input in ways that may violate exact wire truth;
- default validation errors expose framework/schema details and do not match
  canonical Conexus Problems;
- fast-json-stringify response schemas could become a second or lossy schema
  authority unless generated/proved against canonical schemas;
- plugin encapsulation could be mistaken for semantic owner or security
  isolation;
- framework decorators on request must not become I&A/current-authority facts;
- SSE plugin replay/session features must not become AgentRun/PAR truth.

Required adaptation:

```text
Fastify router/lifecycle/injection
+ generated route registry from canonical 4B
+ custom non-mutating JSON Schema 2020-12 validation boundary
+ exact Problem mapper
+ server-derived request/current-authority context
+ explicit owner handler adapters
+ bounded TI-03 SSE adapter
- framework-generated OpenAPI/DTO authority
```

**Pass-1 disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE / LEADING ADAPT
CANDIDATE`.

### B — Hono

Useful properties:

- very small Web Standards Request/Response model;
- clean route composition and typed context;
- portable handlers and direct Node adapter;
- SSE helper exposes abort/close behavior explicitly;
- easy custom test invocation through fetch-style requests;
- low dependency/ontology surface.

Material gaps/risks:

- Node server readiness/shutdown/resource drainage remains more application-owned;
- schema validation and Problem mapping require additional generated/custom
  composition;
- Hono RPC/AppType can become a parallel TypeScript wire authority if exported
  to clients;
- Zod-OpenAPI direction would invert canonical authority and is not admissible
  as the source contract;
- context variables can become false authorization if trusted beyond owner
  rechecks;
- module encapsulation and lifecycle hooks are less opinionated, requiring more
  Conexus mechanism code.

**Pass-1 disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE / STRONG LIGHTWEIGHT
ALTERNATIVE`. It may beat Fastify if exact generated Web-Standard handlers and
manual lifecycle remain materially simpler under proof.

### C — Express 5

Useful properties:

- mature, stable and widely understood middleware/router model;
- minimal framework ontology;
- async rejected handlers now flow to error middleware;
- current official shutdown guidance is explicit and simple.

Material gaps/risks:

- validation, serialization, generated-route binding, request context,
  injection testing, lifecycle/readiness and structured logging require more
  separate decisions or custom code;
- middleware ordering is easy to make security-significant accidentally;
- default error behavior is not canonical Problem truth;
- no encapsulated plugin graph corresponding to bounded transport composition.

**Pass-1 disposition:** `KEEP_REFERENCE_ONLY / FALLBACK`. Mature simplicity is
valuable, but total Conexus-owned infrastructure is larger than Fastify/Hono.

### D — NestJS

Useful properties:

- explicit modules/providers/DI and lifecycle hooks;
- Guards, interceptors, pipes and testing modules support structured server work;
- SSE and multiple platform adapters exist;
- large ecosystem and enterprise familiarity.

Material conflicts:

- decorator/class-validator DTOs and Swagger decorators strongly encourage a
  second wire/schema authority;
- framework modules/providers can be mistaken for Conexus semantic modules and
  dependency rules;
- global Guards/decorators may flatten owner-specific current authorization;
- interceptors/pipes add implicit execution layers around already explicit
  owner/application boundaries;
- RxJS/SSE and DI/reflection increase conceptual and runtime machinery;
- using Nest over Fastify composes two frameworks without a current property
  requiring the upper layer.

**Pass-1 disposition:** `REJECT FOR CURRENT F1`. Reopen only if a real
implementation/property shows the lighter explicit composition cannot scale or
remain coherent.

### E — Node `http` / Web APIs plus custom router

Useful properties:

- maximum control and no framework ontology;
- exact current Node platform behavior;
- natural fit for generated handler tables in theory.

Material cost:

- Conexus would own routing, request parsing/limits, errors, lifecycle,
  injection/testing, hooks, plugins and security hardening without a proven gap
  in mature components.

**Pass-1 disposition:** `KEEP_REFERENCE_ONLY / BUILD ONLY ON FRAMEWORK
FALSIFIER`.

## 6. Leading architecture hypothesis

```text
Fastify composition root
→ generated exact Product route registry
→ separate exact Technical Ingress registry
→ narrow transport adapters
→ current I&A/request context resolution
→ owner application service
→ exact generated response/Problem projection
```

Fastify's plugin graph may group route adapters by owner, but the canonical
dependency graph remains Conexus authority and must be enforced independently.

The hypothesis deliberately does not use:

- Fastify-generated OpenAPI as authority;
- default mutating validation;
- framework roles/guards as Product authorization;
- generic command/query bus;
- automatic DTO decorators;
- a second BFF/screen API;
- Fastify SSE replay identity as AgentRun truth.

## 7. Required falsifiers before selection

### `B01-P1` — generated route bijection

Generate/register all current Product and Technical operations and prove exact
method/path/operation identity with zero missing, extra or duplicate route.

### `B01-P2` — validation fidelity and non-mutation

Run representative JSON Schema 2020-12 positive/negative fixtures through the
router boundary. Input bytes/values must not be silently coerced, defaulted or
stripped beyond canonical wire semantics.

### `B01-P3` — Problem fidelity

For representative 400/401/403/404/409/412/422/503 cases, framework/internal
errors must map to exact safe canonical Problems without leaking schema/stack.

### `B01-P4` — current authority

Stale session/grant/binding/Release context carried in a request must not bypass
the owner recheck. Framework context and plugin presence grant nothing.

### `B01-P5` — Technical Ingress separation

OIDC redirect/callback and TI-03 SSE remain protocol-only, outside Product
census, with no generic framework route capable of selecting Agent/runtime IDs.

### `B01-P6` — SSE lifecycle

Disconnect, timeout, backpressure, late owner settlement and reconnect projection
must preserve `stream != AgentRun truth`; server shutdown must drain/close
honestly without terminalizing owner runs from transport events.

### `B01-P7` — startup/readiness/shutdown

Startup refuses readiness until required dependencies/contracts are admitted;
shutdown stops new admission, drains bounded work, closes resources in owner-safe
order and is idempotent.

### `B01-P8` — owner graph

Static/import/runtime negative controls prove router/plugin modules cannot call
L7 or bypass the accepted owner graph. A plugin-registration hierarchy alone is
not accepted as proof.

### `B01-P9` — comparative smallest-fit probe

Before final selection, implement isolated non-Product probes for the same
generated sample operations in Fastify and Hono, measuring only decision-changing
properties: generated binding size, validation fidelity, Problem mapping, SSE,
lifecycle and test ergonomics. Generic throughput benchmarks are insufficient.

## 8. Pass-1 outcome

```text
OPP-B01 PASS 1 = OPERATOR APPROVED
Fastify = LEADING ADAPT CANDIDATE / NOT SELECTED
Hono = STRONG LIGHTWEIGHT ALTERNATIVE
Express 5 = REFERENCE/FALLBACK
NestJS = REJECT FOR CURRENT F1
Node custom router = BUILD ONLY ON FRAMEWORK FALSIFIER
generated route registry = REQUIRED PROPERTY
non-mutating JSON Schema 2020-12 boundary = REQUIRED PROPERTY
exact Problem mapper = REQUIRED PROPERTY
exact package/version selection = 0
Product implementation authority = 0
```

Fastify leads because it removes more repeated lifecycle/testing infrastructure,
not because its schema/plugin ontology becomes Conexus authority. Hono remains a
genuine challenger until the targeted comparative probe resolves total
complexity.
