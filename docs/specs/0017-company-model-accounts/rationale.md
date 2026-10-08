# 0017. Rationale: model account foundations

## Context

The product needs a company's AI account to outlive the person who connected it, while personal
accounts remain the first payer. The legacy implementation mixes credential ownership with Builder,
permits weak provider/value combinations and leaves refresh persistence tied to caller concerns.
Old specs matched a document template but contained an unsupported approval and contracts that
could not build. Templates and neighboring code do not decide the target; product, architecture,
code principles and fresh reference evidence do.

This rewrite studies 0017 and 0020 as one subject. No product code or pilot data was changed.
The approved study is held privately by firstmate; public evidence below records versions and
reproduction commands without machine paths or company data.

## Options considered

| Option | Best case | Cost and deciding evidence |
| --- | --- | --- |
| Keep drafts | Lowest writing cost, already split | Fresh revoked-waiter probe and absent persistence/constructor contract make build unsafe; unsupported approval is not authority |
| One combined wave | One approval and no inter-wave transfer | Original inventory has ten units and 62 combined declared subjects, before omitted paths; eight-unit limit plus cipher/IAM/providers/UI change threatens one-session cards. Missing persistence can instead be completed in 0017 |
| Two sequential waves, one design | Independently usable foundation, then company experience | Complete outgoing persist/reread/lifecycle contract and separate qualification; least new product machinery. Approved 2026-10-07 |
| Remove company accounts | Smallest code surface | Fails requested independent company ownership, P §2/4; Basejump's human-primary-owner model is a contrary reference, not a reason to keep personal ownership |

## Decision and why

The operator approved study objective/limits/end and two waves on 2026-10-07. He amended 0020
to include installation Builder default selection on the same settings screen; personal/memory
default writers remain outside. Firstmate chose separate spec rewrite branches into their existing
spec branches. On 2026-10-07 the operator answered “0017: Apvo” to the analyzed guarded cutover:
abort on nonempty connector/model credential tables after the already planned S1 local reset,
end sessions/handoffs, same key bytes, manual reconnect, no decoder/re-encryption. These answers
approve study choices, **not this spec or any pilot action**. The unsupported old approval is removed.

For cutover, preserving existing data was a real alternative: a trusted bounded read/reseal migration
would need shutdown/concurrency/recovery/restore handling and more custody-sensitive code.
Keeping legacy ciphertext or adding row binding only for new model rows would narrow the accepted
all-Hub custody target and create two formats. Removing persisted credentials loses unattended
Builder/company-system capability. The approved guarded cutover adds least machinery. We did not
inspect the pilot database or infer its contents from disposable PostgreSQL.

### Mechanism verdicts: three proofs each

Each verdict below states product/guide need, reference evidence and fresh code/runtime evidence.
Today's implementation measures replacement cost; it is never the reason for the target.

| Mechanism / verdict | Need and owning guide | Reference proof (pinned versions in index) | Fresh evidence / cost |
| --- | --- | --- | --- |
| Scoped single table — KEEP prerequisite | P company lifetime; D lawful owner and unique slot | Factory credentials base.ts:96-118 | Unmerged 0071 catalog replay PASS, legal pairs/owner constraints and partial indexes; do not duplicate schema |
| Credential shape — REPLACE | C §3–6 parse once/illegal states | SDK 1.8.3 vendor types; native core parser:392-413 | 3 local parsers/5 plain ids; nullable email absent in SDK; compiled registry and negatives, no class hierarchy |
| Model identity — REPLACE | H/C contract semantics | Native parseModelString | Old string splits/independent parsed fields can disagree; one brand and derived native fields; caller manifest includes controller |
| Cipher algorithm/key/fingerprint — KEEP | S custody/backup consistency | cal.com keyring.ts:74-125 and existing licensed cipher | Current engine passed correct/retired-key probes; adding context does not change algorithm/key bytes |
| Context-free/slot envelope — REPLACE | S immutable owner custody | cal.com setAAD:90/121, adapted beyond type binding | Synthetic transplant opens without row context and with recreated slot; immutable id rejects. Four live CHECKs replayed; forward cutover only |
| Plaintext/legacy alias/decoder — DELETE | C no compatibility, S sealed at rest | Factory secret-encryption.ts:69-112 and cal.com CredentialDataService.ts:26-41 are rejected compatibility policies | 72 live tokens under final scanner, current low-level plaintext fallback; rename all consumers and four CHECKs |
| Broad IAM decrypt catches / copied handoff bytes — REPLACE | S platform fault vs lost custody, D atomic redemption | Existing Conexus authentication transaction; AEAD context reference | session-core.ts:68-73 catches all; application-session.ts:44-49 copies sealed token; compiled reseal usage, real redemption proof required |
| Builder-owned credentials/SQL — REPLACE | A §4–5 core owner, Builder run/payer owner | Frozen registry module.ts:8-39; Factory storage vs tenant adapter | 16 owner files plus builder-table join; full module constructor/routes/jobs/close compiles against actual upstream types |
| Post-run rotated-token persistence — KEEP behavior / REPLACE guard | P uninterrupted paid calls; D conditional durable write | Factory base.ts:329-352 | Actual Google write-back.ts:13-27 calls HeldAccount.persist after run; PostgreSQL post-run baseline passes; outgoing store persist now explicit |
| Pre-wait-only admission — REPLACE | S current right to receive token | Factory current storage plus Documenso/Better Auth current checks; exact waiter mechanism not found | Real createTokenHolds probe: one refresh, revoked waiter reads once and still receives value; fresh per-waiter reread needed, not a new lock service |
| Instance lock — KEEP | Single installed Hub, no replica requirement | Existing lifecycle.ts:54-83 | Active code acquires lock before composition/recovery; CAS only protects stored bytes, not cross-Hub token spending |
| Existing native Google owner/lifecycle — KEEP/move | C-027 accepted provider, A native-first | Existing pinned CLIProxyAPI adapter; no better upstream event API found in examined sources | Pool/router/boot/idle/close and capture consumers exist; 0020 changes generations/capture separately, no hard crash-time promise |
| Generic model builders, extra services, duplicated previews — DELETE proposal | C §4–8 reader/owner simplicity | Native MastraModelConfig and concrete SDK leaves | No production need for generic route engine; removed ModelBuilders map. compile.mjs reads real upstream sources, no nominal lookalike |
| One census — REPLACE checker | C §11 recurring objective checks | Existing TS compiler/Biome/import law | Old scanner accepts moved provider parsers/retired APIs; new AST scans every provider filename and actual symbols, reused downstream |

Removal is considered for every retained capability: deleting subscription refresh/persistence or
Google means product scope loss; deleting custody means losing the accepted row target; deleting
custom census entirely loses objective recurring checks. Narrowing those requirements needs a new
product/guide choice. No service, queue, workflow engine, encrypted-copy migration or broad lock
protocol is introduced.

## Evidence

Measured main `5efbc090c43176ca4e666688769d2a4ee09e1745`; schema
`885addee625db576de92de52d5e0e49aca086cc4`; spec base
`9e66d5bc304438d94ed014affd8f072d8ccf3718`; commands branch
`674f534896c720d2364175323c02bcb88c5bb019`. Forge reads confirmed schema unmerged and
commands product tree identical to main. The old declared union of 62 subjects was not an actual
diff budget. Rewritten 0017 manifest counts 63 paths including both ends of moves, six units.

The approved preview used `node shape/census.mjs --at=<commit>`; U6 replaces it with the permanent production checker in the index. Historical counts at base
are 42 arrows, 3 >80, 3 suppressions, 5 plain id declarations, 3 local parsers, 16 Builder owner
files, 28 retired identifier uses and 72 live custody matches under its documented scope. Original
study's token scope reports 41 code tokens and 6 document lines; these are different measurements,
not a claimed regression. AST fixture proof is required before the implementation installs CI.

Fresh actual five provider/routes/thinking suites: **71 passed, 0 failed, one opt-in real adapter
skip**. Fresh own disposable PostgreSQL 17.10-bookworm: **19 tests passed, 0 skipped**; migration
and catalog snapshots both PASS for main below 0071 and head through 0071. Main has sharing/history;
head has scope/connected/refusal and no history; both currently ENABLE/FORCE RLS. Exactly four
prefix CHECKs were observed. Own container was stopped. A synthetic same-row/same-timestamp
reconnect succeeds; timestamp is not sign-in generation. No real company values were used.

SDK fake-fetch probes of installed anthropic/codex refresh with 400, 401, 500 and network errors
produce unstructured errors without reliable status/code. Native refresh wrappers cannot safely
classify their message; 0020 owns a narrow transport adaptation. Actual token-holds probe reproduces
the revoked-waiter leak; actual RunRow parser accepts a historical BUILDER_MODEL_AUTH_FAILED row
now and rejects it after enum removal, requiring 0020's forward normalization. These results are
inputs corrected from audits, not assertions that an implementation is already fixed.

At spec authoring, the preview compiler used Node24.20.0/TS6.0.2/Zod4.6.5/core1.71.0/code-sdk1.8.3,
extracted pinned upstream interfaces and ran `tsc --noEmit -p` a temporary configuration. It simulated
the planned generated custody failure row; it did not prove runtime or the post-authorization catalog.
U6 deletes that preview and replaces it with actual production compilation, negative fixtures,
current census and disposable migration/catalog proof, as recorded in the index.

### Audit disposition

| Independent finding | Correction / evidence in rewritten spec |
| --- | --- |
| 0017 F1 unsupported approval/delivered claim | Draft status; Starting point names actual main and unmerged schema, no accepted implementation claim |
| F2 missing options/verdicts | Complete wave/cutover options above; mechanism table has three proofs and retained/removed alternatives |
| F3 persistence removed | store.ts exposes owner-system persist with CAS outcome; U4 creates it and proves post-run capture, not 0020 |
| F4 impossible fixed waiter pin | U1 explicitly characterizes main; U5 creates fixed current-admission expectation |
| F5 reusable slot AAD | secrets.ts takes immutable id/digest; Design §1 covers insert/upsert id before seal and delete/recreate |
| F6 broad IAM catch/copy | Design §1 and U3 require narrow custody classification and transactional reseal; configured-key faults propagate |
| F7 incomplete module/inconsistent model/reread error | module.ts complete constructor/lifecycle; ModelId single brand; store reread has HoldError with row/spent; usage crosses Hub/Builder |
| F8 absent Codex email | U2 boundary normalization to null, negative shape and real SDK no-email fixture |
| F9 fictional intermediate budget/write-back | 63 actual intermediate/final paths, persistence+write-back in U4/U5, diff/name-status comparison |
| F10 scanner blind spots | Census AST all provider files plus retired identifier/core import/table/name checks; U6 representative defect fixtures |
| F11 upstream/guide conflicts | Actual 0018/0019 pins, type extraction; schema-before-helper-removal order; D role conflict explicit wait; A/S/C027/C032/config guide edits owned by cards |
| F12 stale SDK/unverified reference | Installed version verified; use actual SDK refresh locations below, local references pinned/read, no unsupported dist line or broad absence claim |
| 0020 cross-boundary F2/F4/F9 | Complete foundation output, single-Hub constraint and real upstream ownership; downstream starts only after proved foundation |

No finding is dismissed because old approval prose said so. Future runtime proofs belong to the
implementing unit. Review findings on this rewrite will be recorded with file/line evidence and
resolved before submission.

## References

Guides read in full: docs/roadmap.md, docs/development/delivery.md (Waves), codebase-principles.md,
reference/architecture.md, reference/database.md, reference/security-and-authority.md, the wire
contract guide mapped by areas.json, product/contract.md, testing guide and DESIGN.md. areas.json
maps platform/session/migrations/core/provider/web subjects; decisions/index.md owns C-027/C-032.

Reference source pins and used lines are in index's References copied. Installed SDK 1.8.3
`dist/auth/providers/anthropic.js:85-102` and `openai-codex.js:139-161,495-505` were read/probed;
the old Anthropic citation beyond its actual file length is removed. Native core fork parser is at
`packages/core/src/llm/model/provider-registry.ts:392-413`. PostgREST path is
`src/library/PostgREST/Query/PreQuery.hs:39-56`; Basejump account SQL and examined Supabase example
are comparison evidence, not imported mechanisms. No machine path belongs in this public rationale.

## Independent rewrite review (2026-10-07)

Two read-only reviewers on gpt-6.1-sol and gpt-6-sol examined this rewrite independently. The first
found omitted renamed-config test consumers, a publicly forgeable context, a promised codec check
missing from census and absent pre-merge real consumer qualification. Corrected U3 consumer lists,
opaque row-context factories and a raw-slot negative, explicit codec-owner AST check, and foundation
conexus-prove with its separate real-turn authorization before merge. The second reviewer identified
that native leaves needed held-row/refresh/persist access rather than a bare Credential, and ModelId
needed its native parser in the actual schema; both shapes now encode those requirements. These are
reviewed design corrections, not claims that product code exists.

Validation after both reviewers' resolution: compile passed, a clean census fixture plus six concrete
defects passed, runtime ModelId valid/invalid and nullable Codex email cases passed, and repository
verify:quick passed (typecheck, Biome, Knip, repository/import/access/census/contract/web-style checks).
These checks validate the spec artifact and current repository; no implementation or live proof is claimed.
