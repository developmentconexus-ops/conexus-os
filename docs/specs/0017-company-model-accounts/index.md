# 0017. Model account foundations and core ownership

**Date**: 2026-10-07
**Status**: Approved by the operator on 2026-10-07, commit a5068fba54c676c2104b642ff08fd54ad9df8890
**Lane**: lane:qualification (Q-b custody; Q-c real Builder proof before foundation merge)
**Wave branch**: wave/company-model-accounts
**Spec rewrite branch**: wave/model-accounts-respec → wave/company-model-accounts-spec
**Study**: Model accounts re-study of 2026-10-07, held privately by firstmate. Study objective, limits and end approved on 2026-10-07; this spec is not approved.

## Summary

A single core module owns model accounts, credentials, provider adapters and refresh persistence.
Builder asks it for a native Mastra model and records which row paid for each call. Secrets bind to
immutable rows, and live configuration stops using Factory envelope names. Personal behavior stays
usable; the company commands, selection rules and settings experience follow in 0020.

## Starting point and dependency gates

The measured main is `5efbc090c43176ca4e666688769d2a4ee09e1745`. The spec base is
`9e66d5bc304438d94ed014affd8f072d8ccf3718`. Schema commit
`885addee625db576de92de52d5e0e49aca086cc4` on `wave/company-model-accounts` is **unmerged**.
It creates 0071, scope/owner/lawful-pair CHECKs, connected metadata and refusal, removes sharing
history and updates personal SQL. It is a prerequisite, not delivered main functionality or approved
implementation evidence. Do not rebuild or edit its migration. Integrate it before 0018 removes
`rls.acting_account()`, which 0071's policy requires. Replay this order against PostgreSQL.

U1 runs on real main before structural movement, then on the schema head. U2 onward waits for
merged implementations of 0018 and 0019, rebases the census through ordinary integration, and
imports their delivered owners. The actual interfaces checked are 0018
`0987494fb358b9c8491fae4476cbc16f05099393`, `shape/types.ts:1-45` (nominal Admitted,
AccountScope, RunScope with RunOwner, SystemScope) and 0019
`b07a99e7d1d7fbd4c24f681befb51a00b92635b0`, `shape/types.ts:1-8`
(two-parameter Result and Code). Those specs are drafts; their runtime exports and post-0018
catalog are not proved. 0018's removal of roles/RLS conflicts with current D §6–7: wait for its
accepted guide change and real owner; this wave neither decides that conflict nor copies admission.

The operator approved two sequential waves and, specifically for 0017, a guarded empty-credential
cutover on 2026-10-07. It follows the local reset already planned at S1 closure. The forward
migration aborts if connector or model credential tables are nonempty, ends sessions/handoffs and
replaces four live envelope CHECKs. Key bytes remain the same. The operator reconnects the
company system and AI accounts manually. No old decoder or re-encryption migration. Reset,
configuration changes and any pilot action remain outside this writing/build task's authority.
Firstmate separately authorized 0020's spec-only branch `wave/model-account-commands-respec`
from `wave/company-model-account-commands`, with its own review pull request into that branch.

## Requirements

- **AC-1**: One codec registry derives the four lawful provider/kind/value variants. Stored data parses once; Codex absent email becomes null. Model identity is one contract-branded string parsed by Mastra, with no independently writable provider/name fields.
- **AC-2**: Existing personal routes, requests, streams, thinking, memory selection and paying-row recording remain behaviorally pinned. Every old test/caller moves with its owner; no retired route export remains for tests.
- **AC-3**: Model-account, connector, session and handoff ciphertext binds to its immutable row identity. Handoff redemption reseals into the session context in the existing authentication transaction. Configuration faults propagate; verified known-key custody loss receives its explicit owner behavior.
- **AC-4**: Live envelope API/configuration uses SecretEncryption, SecretEncryptionKey, createSecretEncryption, CONEXUS_SECRET_KEY_FILE, CONEXUS_PREVIOUS_SECRET_KEY_FILES and `conexus:secret:v1:`. All four database CHECKs and boot/backup consumers agree. There is no plaintext fallback, alias or old decoder.
- **AC-5**: A complete frozen model-account constructor supplies native models, secret-free preflight/default/list/offers, current routes, jobs and close. It owns no Builder imports or tables. Builder alone supplies current run admission and records payer rows.
- **AC-6**: Owner-internal persistence keeps rotated credentials after a run ends, but cannot overwrite reconnect/disconnect or newer bytes. Each refresh waiter obtains fresh admission and a current reread after shared work settles. Admission failure is unchanged; successful disappearance/kind change is distinct; custody failure carries row and spent bytes in hold **and** reread.
- **AC-7**: Guides describe delivered ownership/custody and mark commands/default writer as pending 0020. One executable census rejects retired names/APIs, weak parsers and core→Builder coupling. The last unit replaces the temporary shape with actual code checks.

## References copied

All fork references below are at Mastra `ce7e9c30c1fb22ca37936121d88336ccee1f955c` unless another commit is stated.

| Mechanism | Reference (`repo/file:line`, version) | Kept | Adapted and reason |
| --- | --- | --- | --- |
| Scoped credential row | Mastra `mastracode/factory/src/storage/domains/credentials/base.ts:96-118` | One provider slot per owner/scope | Existing 0071 installation ownership, no person owner; no second table |
| Current membership | Documenso `packages/lib/server-only/team/get-team.ts:38-73`, `cd0cc5febcbb76ec7e5ecb75c0b8c65ab8432198`; Better Auth `packages/better-auth/src/plugins/organization/routes/crud-org.ts:425-465`, `0e1a9c8413ff048a617cad81ab67175933ca8c7a` | Check current authority at use | Consume 0018 proofs; never cache a run's right to receive tokens |
| Durable refresh | Mastra credentials `base.ts:329-352`; tenant adapter `mastracode/factory/src/routes/tenant-credentials.ts:119-155` | Read, refresh, persist under credential owner | Single-Hub serialization, compare spent ciphertext; no replica claim or adapter catch-to-undefined |
| Credential/native model edge | Installed code-sdk 1.8.3 token types; Mastra `packages/core/src/llm/model/provider-registry.ts:392-413` | Vendor token fields and native parser | One closed codec registry, nullable SDK email normalized at edge, opaque ModelId |
| AEAD context | cal.com `packages/lib/crypto/keyring.ts:74-125`, `54343aa685ae8f33159d2f485ec4a57bad5c574a` | AES-GCM setAAD | Immutable row id/digest, not reusable slot/type. Reject cal.com's credential plaintext compatibility (`CredentialDataService.ts:26-41`) |
| Frozen module | Conexus `apps/hub/src/registry/module.ts:8-39`, main `5efbc090` | Constructor, operations, owned lifecycle | Complete model-account owner, no general service/engine |
| Refresh release after shared work | Not found in examined Factory adapter/atomic store or installed holds | Existing process-local singleflight | Fresh per-waiter run admission; required by observed revoked-waiter defect |

PostgREST `src/library/PostgREST/Query/PreQuery.hs:39-56` at `d42ae9d55d12989cdc2f0fda8d551b07af4e6ab5`
and Supabase's examined auth.uid/RLS example inform the dependency check; they do not authorize
this wave to silently replace current D's role model. Basejump's human primary owner
(`accounts.sql:48-71`, `7a1f95ccef74eb2e638d5e4233b66b6cbbe175e6`) is deliberately rejected.

## Code shape

`shape/credential.ts`, `secrets.ts`, `store.ts`, `module.ts`, `usage.ts` and `negative.ts` are the
compiled target. `node docs/specs/0017-company-model-accounts/shape/compile.mjs` runs the pinned
TypeScript compiler with `--noEmit -p` against **actual extracted upstream source**, not a copied
nominal proof. It extracts only 0018 types and 0019 types at the commits above into a temporary
directory. Only the planned generated SECRET_CUSTODY_LOST code is simulated. Compilation passed
with Node 24.20.0, TypeScript 6.0.2, Zod 4.6.5, core 1.71.0 and code-sdk 1.8.3.
The normal `npx tsc --noEmit -p shape` requires the delivered upstream import mappings; after
integration repoint `#admission-types`/`#failure-types` to those exact owners and run it directly.
No runtime compatibility is claimed from compiling draft shapes. Product tests never import shape.

A ModelId contains one parsed string. Derive prefix/model name at the native adapter boundary;
no separate ParsedModelId bag can contradict it. A hold has one Credential, rather than duplicate
provider/kind fields. Secret contexts require a ModelAccountId, ConnectionId or IAM Digest. A
reusable scope/provider slot is insufficient. The constructor receives the real Database, envelope,
thinking configuration and optional Google runtime configuration; HTTP registration, jobs and
close all appear in Hub usage. Provider protocol leaves stay concrete native functions.

## Design

### 1. Custody and forward migration

AAD bytes are `JSON.stringify(['conexus-aad-v1', owner, binding])`. Binding is the immutable
model_account_id, connection_id or hex-encoded session/handoff token digest. Platform owns the
cipher/context format; domain stores make contexts. To upsert, obtain the existing row id under
its write lock or mint the insert id **before sealing**; ON CONFLICT must not retain a different
id than the one used in AAD. Delete/recreate gets a new id, so old bytes cannot transplant. Keep
the current AES-256-GCM engine, key-id derivation, retired-key handling and fingerprint semantics.

Handoff DELETE RETURNING, destination digest creation, reseal and session INSERT occur inside the
existing authentication gate. Never copy a handoff envelope into the session column. Known-key
authentication/tag failure is SECRET_CUSTODY_LOST. Missing or unknown configured key is CONFIG_INVALID,
including session read and sign-out: no broad catch that pretends every error is lost custody.
Custody loss ends the affected session/handoff through its existing owner; configuration faults fail
as platform faults. Connectors retain their owner's explicit failure. No company refusal mark in 0017.

The next unused forward migration `<next>_secret_custody.sql` verifies these exact live CHECKs:
`connector.connection.connection_credential_sealed_check`, `iam.handoff.handoff_token_sealed_check`,
`iam.host_session.host_session_token_sealed_check`, `model.model_account.model_account_secret_sealed_check`.
Abort if either durable credential table is nonempty, DELETE sessions/handoffs, replace only these
four CHECKs without CASCADE and regenerate catalog mirrors. Do not edit 0071/applied history.
Use the approved operator-owned cutover; a preservation requirement reopens it rather than adding
compatibility. No key bytes, algorithm or fingerprint rotation policy changes.

### 2. Strong values and complete owner

Credential codecs cover Anthropic key/subscription, Codex subscription and Google encoded record.
One JSON codec plus the Google encoded-record edge live in credential.ts; provider leaves contain
no JSON parsing. Normalization occurs before Codex codec encoding. Invalid stored values become
a table-coded existing failure, not uncaught ZodError. Strong ModelId/ModelRole live in contract.
Native parser behavior and current thinking/catalog filters remain pinned; no new model catalog.

U4 moves the already strong personal owner and real consumers, not an unused folder. Its constructor
returns the compiled module surface; it registers all **existing** personal operations, including Google
status and existing default reads. It owns Google boot orphan sweep, router, pool, write-back, jobs
and close. Personal routes remain because the current screen calls them; 0020 replaces these wire
contracts and their callers together. The current endpoints are not aliases for future endpoints.

| Operation | Value source | Outcome / authority |
| --- | --- | --- |
| modelFor | Builder's current OpenRun, parsed model, ThinkingLevel | Result with native MastraModelConfig and paying row id; Builder records it in its own admitted transaction |
| checkBeforeRun | Authenticated AccountId, model ids | Admitted secret-free metadata checks; never decrypt in this operation |
| list/offers/default reads | Authenticated account, contract build/memory role | Current secret-free responses; read admission from 0018 |
| personal connect/routes | Session account/display name, parsed wire input | Account write proof; no installation writer yet |
| hold/reread | Fresh run proof / OpenRun | Held row, gone or typed error; no core joins to Builder tables |
| persist | Owner system admission, held row/spent bytes, typed next credential | Stored new hold or superseded; no dependency on an ongoing run |
| registerRoutes/jobs/close | Hub Fastify instance/config and platform lifecycle | Actual routes/job list, shutdown after jobs settle and before database close |

### 3. Refresh persistence and release

Do not keep a run transaction open across provider network I/O. Take an admitted held snapshot,
finish that transaction, then serialize refresh by row inside the single Hub. Before external refresh,
reread current bytes; another completed refresh may already supply fresh tokens. Save rotated tokens
through an owner-internal system transaction using id, lawful pair, scope/owner and spent ciphertext
as conditions. A failed condition is superseded, never an unconditional overwrite. This is also the
Google final-capture writer after run completion. No plaintext appears in tracing/response/disk outside
the already accepted Google native credential-file lifetime.

Every waiter, including the singleflight winner, performs its own OpenRun/reread **after** the shared
work settles and persistence completes. A revoked waiter receives the upstream admission error, not
another waiter's returned tokens. Successful row disappearance/kind change is gone; custody carries
row/spent context in both hold and reread. Provider-config resolution maps those outcomes through
0019 at the native Mastra resolver boundary. No generic error engine. A future persistent refusal
transaction in 0020 must start after any held caller transaction has ended, avoiding a conflicting lock.

CAS protects persistence, not provider-token spending across two Hub processes. The instance lock
in `platform/lifecycle.ts:54-83` remains a premise. This wave makes no multi-Hub support claim.

### 4. Scenarios and owning guide changes

Reuse current deciding suites rather than replacing them with source assertions. U1 pins requests,
streams, paying ids, memory/thinking, login ownership and current refresh/capture; changed custody
and revoked-waiter expectations belong to their implementing units, never a red pin on main.
U3 tests each owner's right/wrong immutable context, delete/recreate, retired-key opening, missing-key
classification, actual handoff redemption and migration guard/rollback/four CHECKs. U5 tests two
waiters with one revoked after start, refresh after run end, reconnect/disconnect before persistence,
and reread custody context using real PostgreSQL plus deterministic native provider fakes.

S §6 sentence becomes: “A secret at rest is sealed with the installation's envelope and bound to the
immutable identity of the row it belongs to.” A §4–5 names model-account as the core owner and
Builder as run/payer owner; A §11 and C-027 move the existing Google adapter path/lifetime without
claiming better crash capture yet. C-032 describes company rows as schema capability and company
commands as pending 0020. Backup and 0008's consumed configuration interface use the new key
names; do not redesign their other content.

## Deletes and census

Run `node shape/census.mjs --at=<commit>` for a reproducible committed baseline, or without --at
for the working tree. The rewritten script counts JSON.parse in **every provider file**, regardless
of filename, and retired identifiers even after files move. It checks core imports and Builder table
literals. Live names include tests, fixture inputs, scripts and owning configuration/backup prose.
Historical migrations/specs and license comments remain records; only the named retired-input fixture
and two migration-history suites are excluded. No global text exemption for provider code.

| What | Today at spec base | Final target | Holding check |
| --- | ---: | ---: | --- |
| Top-level arrow functions / functions >80 lines / suppressions | 42 / 3 / 3 | 0 / 0 / 0 in owned subjects | TS AST and existing Biome |
| Plain id declarations | 5 | 0 | TS AST, contract brands |
| Provider-local JSON parsers | 3 | 0 outside credential edge | AST, all provider files |
| Builder credential-owner files | 16 | 0 | Path census + import law |
| Retired routing/store identifier uses | 28 | 0 | AST identifier census |
| Core imports / Builder table references | 0 / 0 in currently nonexistent core | 0 / 0 in delivered core | Census + import law; zero baseline is not implementation proof |
| Live custody-name occurrences | 72 under this exact scanner | 0 | Token-aware census; not the study's differently scoped 41 code tokens/6 document lines |

U6 proves the census with a clean fixture and representative defect fixtures: moved provider JSON
parser, retired API, core import/table, live old name and illicit codec location. Reuse the single
census owner in 0020; do not build a checker framework. Extend the existing CI entrypoint/import law.
Credential registry exhaustiveness remains TypeScript's check, not a second code parser.

Delete weak token shapes/parsers (U2); context-free/plaintext cipher, broad IAM catches and live
Factory envelope vocabulary (U3); all sixteen old Builder-owned credential/provider files and
createModelRouting/ModelRoutes/ModelRoute/takeFrom/routeOf/Taken, old withRun/RunContext/
ADMISSION_REFUSALS and Builder joins (U4); unconditional refresh persistence and stale-waiter
release (U5); temporary shape (U6). Move every test with its production caller.

`shape/file-budget.mjs` names **63 actual product paths**, including both intermediate old and final
new paths. Tests/guides/generated outputs are recorded separately, not silently called product.
Each card uses its manifest plus named tests/guides below; migrations resolve `<next>` from merged
history before build. Record actual `git diff --name-status` per unit and compare with the manifest.
A discovered caller not listed returns for spec correction; do not hide it as a “final identity”.

## Units

Each builder reads its card, the Design sections it cites, References copied and shape. Each ends
with its deciding tests, shape compile (direct delivered-owner mappings once upstream lands),
`npm run verify:quick` and one green commit. The manifest in file-budget.mjs is the exact product
allowlist; named tests/guide edits are additional non-product paths. No code outside the card.

### U1. Pin real personal behavior before movement

- **Already there**: Actual main `5efbc090`; existing builder-anthropic, builder-openai-codex, builder-google-ai-pro, builder-thinking-level, model-account-routes, builder-session-routes, model-account.postgres, iam-sessions.postgres and connector-broker.postgres suites in tests/implementation. Schema-specific company-model-accounts-migration.postgres suite runs only after schema integration.
- **Creates**: Missing behavioral characterization in those same suites, plus model-accounts-fake.mjs and builder-google-ai-pro-fake-cliproxy.mjs when needed. Pin literal requests, native streamed answer, exact payer ids, memory/thinking and current login/refresh/close behavior. List reused cases and gaps in proof receipt.
- **Satisfies**: AC-2; AC-3/5/6 regression baseline.
- **Files**: Those named test/fixture paths only; U1 manifest has zero product paths. No shape/product edits.
- **Copies**: Current native test boundary, not its structural seam.
- **Guide sections**: C §4–5; T §1–4/6–7; L Waves.
- **Deletes**: Source-text assertions only where replaced by deciding runtime behavior.
- **Proof**: Green first on main, then schema head. Current revoked-waiter defect is recorded, not asserted fixed. Schema replay has 19 tests already passing in the study. Do not call real providers/E2B.
- **Out of scope**: New ownership/types/custody/selection behavior.
- **Stop if**: Pin requires a product change, upstream main changed observed behavior, or fixtures cannot exercise the actual caller.

### U2. Derive strong credentials and model identity at the current owner

- **Already there**: U1/schema; delivered 0018/0019 contracts and approved dependency order. Read Design §2 and credential/negative shape.
- **Creates**: One registry/codecs in current builder/model-account/providers.ts, contract ModelId/ModelRole and parse/encode edges. Final credential.ts content is placed in this existing owner until U4 moves it; no duplicate new owner yet.
- **Satisfies**: AC-1/2.
- **Files**: U2 actual-path manifest: all current credential/provider files, named Builder model consumers including harness/controller.ts, and contract ids/model-account/index. Tests: U1 provider/thinking/routes/account suites and new model-account-types.test-d.ts under tests/implementation.
- **Copies**: Credential/native model reference row; native SDK fields.
- **Guide sections**: C §3–6; H §1/8; A native-first.
- **Deletes**: Three local parsers, weak pair/token types and writable parsed-model fields, moving all native/test callers now. Existing Google record validation moves into the single credential edge.
- **Proof**: Four lawful roundtrips; malformed values/illegal pair fail; SDK no-email fixture becomes null. Negative types cover brands, pair/value and required fields. Provider JSON parser count 3→0 outside the new edge after U4; while in current providers.ts the manifest records this exact temporary codec edge. U1 request behavior remains green.
- **Out of scope**: Core move, custody migration, new commands or refresh policy.
- **Stop if**: Delivered upstream types differ, caller needs a cast/weak string, or parser survives merely for a test.

### U3. Bind immutable rows and retire live envelope names

- **Already there**: U2/schema, actual upstream proof/failure owners, approved empty-credential cutover. Read Design §1/4 and secrets shape.
- **Creates**: Row-required seal/open/reseal; SECRET_CUSTODY_LOST row in failures table, generated outputs; renamed cipher/config API and next forward four-CHECK migration. Mint/read locked row identity before sealing in current model/connector stores; reseal handoff in existing IAM gate.
- **Satisfies**: AC-3/4/7 custody.
- **Files**: U3 product manifest. Tests: iam-sessions.postgres, connector-broker.postgres, model-account.postgres, company-model-accounts-migration.postgres plus new secret-custody.test.mjs, secret-custody-migration.postgres.test.mjs and tests/fixtures/secret-custody-retired.json. Rename-variable callers also include tests/implementation/builder-composition.postgres.test.mjs, builder-planning-free-boot.test.mjs, workspace-http.test.mjs, hub-role-register.test.mjs, application-host.test.mjs and connector-broker.test.mjs. Generated catalog/failures mirrors through existing generators. Guides: S §6, docs/reference/backup.md, infra/backup/README.md and 0008 consumed key-configuration interface only.
- **Copies**: AEAD row and existing cipher/key/fingerprint implementation, preserving license provenance.
- **Guide sections**: C §3–8; D §2–3/5–8; S §4/6–7; T §4/6–7; L needs:aprovo.
- **Deletes**: All old live names, plaintext/context-free APIs and catch-all IAM decrypt handling, with boot/backup/fixture consumers moved together. No aliases/old decoder.
- **Proof**: All Design §4 custody/migration cases, four exact CHECKs, empty guard/rollback, real HTTP handoff redemption, new-variable boot and old-only rejection. Wrong row and delete/recreate fail; retired key opens; unknown/missing key remains CONFIG_INVALID. Count live custody names 72→0.
- **Out of scope**: Pilot reset, key changes, credential preservation migration and real connector calls.
- **Stop if**: Guard/cutover differs, row identity cannot be known before seal, CHECK set differs, or more than a fresh session is required.

### U4. Move the complete personal owner and its real consumers

- **Already there**: U1–U3 strong values/custody and current personal operations. Read Design §2/3 and module/store/usage shape.
- **Creates**: Concrete frozen core constructor and full lifecycle, moved provider/native mechanics, admitted hold/reread and owner-internal CAS persistence. Builder OpenRun and paying recorder consume it. The store's persistence exists in this unit, including final Google capture after run end; it is not left for 0020.
- **Satisfies**: AC-2/5/6 persistence; AC-7 ownership.
- **Files**: U4 old+new manifest, hub.ts/platform db job registration, Builder consumers. Move U1 suites/fixtures to actual core exports; add model-account-module.test.mjs. Guides: architecture §4–5/11, decisions owning C-027 and C-032, review/areas.json paths. No other spec redesign.
- **Copies**: Frozen module and durable-refresh owner rows. Keep native protocols/lifetimes.
- **Guide sections**: C §1/3–8/10; A §4–5/8/11; D §5–8; H §1/3–5; S §2/6; T §4/6–7.
- **Deletes**: Sixteen Builder-owned files, old routing/store APIs and Builder joins; every current production/test consumer moves in this commit. Model-routing.ts may remain solely as Builder's native resolver/payer adapter, with new API only.
- **Proof**: U1 pins through actual constructor; Hub routes/jobs/close exercised; native MastraModelConfig; PostgreSQL successful post-run persist and superseded reconnect/disconnect writes; hold **and** reread custody context. Core import/table count stays zero, Builder owner paths 16→0. No native route injected only for tests. The native leaf receives the held row plus owner refresh/persist callbacks, so it retains CAS/custody context without joining Builder tables.
- **Out of scope**: New company wire/list/selection/commands/refusal/common-attempt/Google-generation behavior.
- **Stop if**: Movement requires unplanned business behavior, exports differ, missing persistence consumer appears or unit cannot end independently green.

### U5. Release refreshed tokens only through each current caller

- **Already there**: U4 complete owner, CAS writer, native provider leaves and Builder OpenRun. Read Design §3 and store/usage shape.
- **Creates**: Row-local serialization with fresh snapshot before refresh; post-settlement fresh admission/reread for **every** waiter. Preserve successfully rotated tokens even if caller ends; then refuse release to that caller.
- **Satisfies**: AC-6 and AC-2 refresh regression.
- **Files**: U5 manifest (store/refresh/Google write-back and Builder admission adapters). Tests: model-account.postgres, builder-anthropic, builder-openai-codex, builder-google-ai-pro and model-account-module suites.
- **Copies**: Durable-refresh and release reference rows; owner uses existing singleflight, not a concurrency service.
- **Guide sections**: C §4–8; A §4–5; D §5–8; S current authority; T §4/6–7.
- **Deletes**: Stale pre-wait-only admission, unconditional release/write and any persistence adapter needing a live run.
- **Proof**: Two fake-provider waiters share one refresh; revoke one between start/settle and it receives unchanged admission failure. End winning run: rotated tokens persist but release is refused. Reconnect/disconnect prevents overwrite; next usable caller reads winning stored bytes. System write occurs after the caller transaction ends. No claim about two simultaneous Hubs.
- **Out of scope**: Persistent refusal, OAuth HTTP classifier, attempt redesign or periodic Google capture (0020).
- **Stop if**: Single-Hub premise is false or result/custody context cannot be preserved without changing upstream.

### U6. Install objective checks and close the foundation

- **Already there**: U1–U5 actual owners and deciding behavior. Read Deletes and census.
- **Creates**: One scripts/check-model-account-census.mjs copied/adapted from shape/census.mjs, connected to current verify/import law. Negative type cases live beside production-bound tests, not under temporary shape.
- **Satisfies**: AC-7 and final AC-1–6 regression.
- **Files**: U6 manifest; tests/implementation/model-account-census.test.mjs and model-account-types.test-d.ts; foundation guide/doc wording only. Delete every shape file.
- **Copies**: Existing verification entrypoint and TS checker; no verifier engine.
- **Guide sections**: C §10–11; A import law; T §4/6–7; L Waves.
- **Deletes**: Temporary shape and preview mappings; no production owner/alias is retained for tests.
- **Proof**: Census final zeros, clean/defect fixtures, actual-owner type negatives, recorded per-unit path budgets and npm run verify:quick. Re-run PostgreSQL replay/catalog and U1 regression after integration. 0020 remains undelivered and unapproved.
- **Out of scope**: Commands/default writer or broad unrelated cleanup.
- **Stop if**: A zero is achieved by exclusion rather than deletion, or actual diff exceeds 70 product paths.

## Non-goals

0020 owns installation commands, personal-first company fallback, secret-free standing/preflight,
refusal, common attempts, classified refresh, Google generations/capture/tickets, three provider cards
and the installation Builder default writer on that same screen (approved study amendment).
Personal and memory default writers remain outside both waves. No second company/Hub, quotas,
queue/service, live reset, merge or another spec's internals. No real E2B/model calls during this writing task or local unit work; the bounded wave qualification below obtains its own authorization.

## Foundation wave qualification before merge

After U6, run conexus-prove against the actual installed foundation, not only fake adapters. The
foundation remains unmergeable until a separately operator-authorized real Builder turn exercises
native model resolution, stream response and exact payer recording through this core, including the
configured native Google lifecycle if Google is enabled. Use the repository verify skill isolation and
retain a durable receipt under T §9–10. No E2B/provider/pilot effect is authorized by this draft; request
that bounded proof through firstmate at prove stage. Custody/boot/catalog proofs use local fixtures;
the real turn proves the consumer contract and sends no company secrets to the sandbox. 0020's real
company-scope proof is additional, not a substitute for the foundation's pre-merge consumer proof.

## What breaks the premise

Delivered admission/Result or schema integration order differs; credentials must survive cutover;
immutable id cannot be retained atomically; native provider pins change; Google cannot persist after
run end; or single-Hub instance exclusion is not enforced. Return with evidence and options.

## Stop rule

Stop for an undecided product choice, falsified premise, upstream owner conflict, unit larger than one
fresh session or more than eight units/70 actual product paths. Do not build a shim or silently narrow
an AC. This draft opens no implementation or pilot operation.
