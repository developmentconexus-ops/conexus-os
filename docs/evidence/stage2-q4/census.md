# Stage 2 Q4 — native census (Q4.0)

Date: 2026-09-24. Executed before the first product edit.

Installed versions, read from `node_modules/@mastra/*/package.json` and pinned by `package-lock.json`:
`@mastra/core` 1.67.0, `@mastra/mcp` 1.18.0 (transitive, not a direct dependency), `@mastra/observability`
1.17.8, `@mastra/factory` 0.15.0. `zod` 4.5.2 (root `package.json`).

Every row cites an installed file and version or a URL read on 2026-09-24. `USE` means the design
consumes the mechanism. `KEEP` means the repository already has it and it stays. `NOT FIT` records why.

## USE

| Mechanism | Native offer and source | Decision |
| --- | --- | --- |
| Operation input and output contract | `zod` 4.5.2. The repository rule is AJV on control-plane HTTP routes and Zod elsewhere ([review checklist](../../development/review-checklist.md)). An operation's contract is not a control-plane route. | USE Zod for each operation's input and output. The Connection and Grant HTTP operations use the OpenAPI plus AJV path like every other Product operation. |
| Agent wrapper | `createTool` in `@mastra/core` 1.67.0, `dist/tools/tool.d.ts:308`. `execute(inputData, context)` receives `context.requestContext` always (`dist/tools/types.d.ts:514`). | USE, in Q4.9 (later part). `createTool` wraps an operation; it does not define it. The session's Project comes from the `RequestContext` the Hub sets, never from the tool input. |
| Request context for the session's Project | `@mastra/core/request-context` `RequestContext`. Already used by the Hub in `apps/hub/src/builder/factory-routes.ts:79` and `factory-runtime.ts:315`. | USE. |
| Credential encryption | `@mastra/factory` 0.15.0 `dist/secret-encryption.d.ts`: `createFactorySecretEncryption`, versioned AES-256-GCM, `previous` keys decrypt only. | USE through the Hub's existing wrapper `createSecretEnvelope` (`apps/hub/src/platform/secrets.ts`). No new cipher and no new key path. |
| Trace redaction | `@mastra/observability` 1.17.8 `dist/span_processors/sensitive-data-filter.d.ts`. `SensitiveDataFilter` matches a key only when its normalized form equals a listed field exactly (`dist/index.js:9302`, `isSensitive`). The defaults are `password`, `token`, `secret`, `key`, `apikey`, `auth`, `authorization`, `bearer`, `bearertoken`, `jwt`, `credential`, `clientsecret`, `privatekey`, `refresh`, `ssn`. The Hub already turns it on (`apps/hub/src/builder/module.ts:129`, `sensitiveDataFilter: true`). | USE as a second line, not the first. `xToken` and `access_token` normalize to `xtoken` and `accesstoken`, which are not in the defaults, so the filter would not redact them. The design therefore rests on the credential never entering a span: the broker is not traced, and the agent tool's input, output and request context carry only the typed operation contract and the Project id. Property P2 is held by that rule, and by a test that asserts it. |
| Future integrator | `createWorkflow` (`@mastra/core` 1.67.0 `dist/workflows/create.d.ts:45`) and `createStep`. | USE as the design-only consumer of kind `integrator`. Nothing is built in Q4. |
| Sankhya Skill source | [`sankhya-skills`](https://github.com/andressaolivi/sankhya-skills), MIT. `sankhya-dicionario/` holds a data dictionary (TGFCAB, TGFITE and TGFPAR in `tgf_operacional.md`) and `sankhya-funcionamento/` holds `fluxo_compras.md` (repository page read on 2026-09-24). | USE as a source only, with attribution. Every table and field is checked against the company's Sankhya version before it enters the Skill. That check needs the pilot and comes after gate G0. Until then the Skill marks each field `not yet checked against the company's version`. |
| Sankhya Skill text, written (Q4.5) | `apps/hub/src/connectors/sankhya/skill.ts` | Task Q4.5 wrote the Skill the Builder reads in product language, attributed to the source above, and confirmed no table, entity or field name of it (and no service, host, URL or header name) entered the Skill text, so the "checked table by table" condition this row names holds trivially: there is nothing named to check. |

## KEEP

| Mechanism | Source | Decision |
| --- | --- | --- |
| Installation secret key and the sealed-envelope format | `apps/hub/src/platform/secrets.ts` (`createSecretEnvelope`, prefix `mastra:factory-secret:v1:`), `CONEXUS_FACTORY_SECRET_KEY_FILE` | KEEP. The Connection stores the sealed string. |
| Runner relay, Q1 worker boundary | `apps/hub/src/app-runner/pg-relay.ts`, `supervisor.ts`, `worker.ts` | KEEP. Q4 adds one relay beside the database relay and one field to the handler context. |
| Wire and role machinery | `contracts/api/product/*.yaml`, `scripts/generate-r1-s*-contracts.mjs`, `docs/reference/hub-database-roles.md` | KEEP. The Connection and Grant operations follow the Q3 application-access pattern. |

## NOT FIT

| Candidate | Source | Reason |
| --- | --- | --- |
| Factory `IntegrationConnection` | `@mastra/factory` 0.15.0 `dist/capabilities/connection.d.ts`: `{ type: 'app-installation'; installationId } \| { type: 'oauth'; accessToken }`, and `dist/integrations/{github,linear,slack,workos,incidentio}` | The Factory's own connections for its integrations. They hold no per-Project, per-operation grant and no client-credentials shape, and their storage is the Factory's. C-022 and C-025 keep an enterprise credential out of Factory rows. |
| Mastra `toolProviders` | `@mastra/core` 1.67.0 `dist/tool-provider/runtime.d.ts` (`resolveStoredToolProviders`, connection labels) | The connection lives with a vendor provider, so custody is not Conexus's. |
| Mastra FGA | `@mastra/core` 1.67.0 `dist/auth/ee/interfaces/fga.d.ts`; `dist/_types/@internal_auth/dist/ee/license.d.ts` ("No license key configured → EE features disabled"); `LICENSE.md` puts `ee/` under a separate license; [FGA is Enterprise in production](https://mastra.ai/blog/introducing-fine-grained-authorization) | Enterprise in production. The grant check lives in the broker and in PostgreSQL. |
| `MCPServer` | `@mastra/mcp` 1.18.0 `dist/server/server.d.ts:55`. Not a direct dependency of the repository. | A later surface for external agents. Q4 does not add `@mastra/mcp` as a direct dependency (task section 10). |
| Activepieces as a runtime | [`fetch-http-client.ts` line 30](https://github.com/activepieces/activepieces/blob/main/packages/pieces/common/src/lib/http/core/fetch-http-client.ts), read by the build-or-adopt study on 2026-09-24: `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` for the whole process. Its `custom_api_call` action is the `privilegedFetch` that R09 forbids. | MIT pieces stay a source to port from, with attribution. |
| Nango, free self-host | [self-hosting](https://nango.dev/docs/guides/platform/self-hosting) | Covers auth and proxy only. Functions, syncs and webhooks need Enterprise or Cloud. |
| Vendor-custody providers | Composio, Arcade, Merge | The vendor holds the credential. |
| n8n, Pipedream | [n8n license](https://github.com/n8n-io/n8n/blob/master/LICENSE.md), [Pipedream license](https://github.com/PipedreamHQ/pipedream/blob/master/LICENSE) | The licenses restrict this use. |

## PostgreSQL and the Hub's own patterns

| Need | Native offer | Decision |
| --- | --- | --- |
| Grant cannot cross Workspaces (P7) | A composite foreign key from the grant to the Connection and to the Project on the same `workspace_id`. | USE. A cross-Workspace grant is unrepresentable in the table, not refused in TypeScript. |
| Revocation and disablement checked on every call (P8) | A `SECURITY DEFINER` function with a pinned `search_path`, the pattern `docs/reference/security-and-authority.md` section 2 names. | USE. The broker asks PostgreSQL for the grant on every call. |

## Sankhya services admitted for G0

Documentation read on 2026-09-24. No Sankhya request of any kind was made.

| Service | Documentation | Why it is admitted |
| --- | --- | --- |
| `POST /authenticate` (client credentials plus `X-Token`) | [post_authenticate](https://developer.sankhya.com.br/reference/post_authenticate) | The token call, the one admitted non-read call, which the operator decided on 2026-09-26. It issues an access token and touches no business record. |
| `CRUDServiceProvider.loadRecords` | [get_loadrecords](https://developer.sankhya.com.br/reference/get_loadrecords.md), [criteria](https://developer.sankhya.com.br/reference/get_criteriosloadrecords.md) | The documentation calls it the generic query service ("consultas") over the entities. The service name alone does not fix what it reads: the root entity and the field list are fixed by the operation, not by the consumer. |

The list of `docs/evidence/stage2-q4/design.md` and the adapter's source repeat these two and no other.
