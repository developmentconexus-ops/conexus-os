# 0017. Rationale: model account foundations and core ownership

## Context

The operator wants the Mastra Factory's personal account and organization account behavior.
Conexus serves one company per installation, so the second account belongs to the installation.
The approved study found six causes to remove: person-owned shared rows, repeated provider flows
and cards, competing account selection rules, a dead sign-in with no persistent fact, row facts
kept only in process memory, and model accounts owned by the Builder rather than the core.

Part 1 is accepted at `885addee`. The scoped table, ownership CHECK, lawful provider/kind CHECK,
partial unique indexes and connection/refusal metadata already exist. The two remaining waves consume
that schema. This foundation does not deliver installation commands or screen behavior. The half-built part 2 is reference material, not a patch to apply. Its session exceeded
its budget and the operator corrected both a routing API retained only for tests and new code
written on weak string/credential types. The rewrite must prevent those errors structurally.

## Options considered

### Keep the person's sharing flag

This has the smallest change, but the company account belongs to the connecting person.
It cannot satisfy the operator's decision that revoking or deactivating that administrator leaves
the company account available. It also preserves repeated flows and account selection rules.
Part 1 has already removed this option's schema.

### Keep a separate installation table

Separate tables express ownership simply, but selection must combine both, runs must record two
origins, and secret custody and refresh are duplicated. The Factory reference uses one table with
partial unique indexes. The approved choice goes further by explicitly checking scope and owner.

### One scoped table and one core owner

This is the approved target. A registry derives the legal credential pairs and their values.
One pure accountInUse function serves listing, offers, preflight and model calls. One sign-in owner
handles the common lifecycle. Provider leaves retain native SDK calls where those APIs carry the
needed facts. A refused credential is a persisted row fact, committed separately from a failed run.

## Decision and why

The operator's decisions of 2026-10-06 remain in force:

| Study decisions | Accepted choice |
| --- | --- |
| 1-3 | Company keys and subscriptions; installation ownership without a person owner; personal first on screen and in runs |
| 4-7 | Scope control on the existing settings screen; all four sign-in kinds; refusal notice with a settings link; Empresa marker in the picker |
| 8-11 | Originally one wave; split into sequential 0017/0020 on 2026-10-07; model-account core owner; Google remains with its file risk declared; row-bound AAD for every Hub secret |
| 12-14 | One table and checked ownership; connection metadata and structured logs; preflight opens no secret |
| 15-18 | Checked provider/kind and refusal fields; scoped operations; connecting name/date visible; removal in both scopes |
| 19 | Refused personal account remains selected; disconnect explicitly to use the company account |

The final approved screen groups Anthropic key and subscription in one provider card, leaving
three cards and four sign-in kinds. Each model call selects again. An account is never pinned for
an entire run; Builder owns recording each paying row. The connecting name is copied at connect,
so IAM does not disclose another person's account/email to implement coverage text.

The 2026-10-07 planning-session decisions settle the upstream contracts and naming:

- 0018 owns the nominal admission proof, admitted reads and retained run/system/bootstrap scopes.
  This wave consumes them, including OpenRun's run admission, after 0018 merges.
- 0019 owns Failure and the result union `{ ok: true, result } | { ok: false, error }`, with
  `error.code` from the failure table and one failureResponse returning native Response.
  No shared error engine is designed here. U2 and later wait for that wave too.
- Remove every replaced legacy function/name with its callers, and update its owning guide.
  The operator chose to remove Factory naming from source, key environment variables and the
  persisted envelope discriminator. A new forward migration replaces the four live prefix CHECKs;
  0071 is never edited. No alias or old decoder remains. The operator resets and renames local
  configuration and re-enters the connector credential and model accounts afterward.

Both independent interrogate reviewers found the old combined U4 larger than the exhausted
part 2. On 2026-10-07 the operator chose two sequential waves. 0017 has four units: pin, derived
credentials/model ids, row custody/configuration/migration, and a behavior-preserving core move.
0020 has six: extend only missing pins, scoped commands/list/selection, shared sign-in, refusal and
OAuth races, Google generations, then cards and guides. Each wire-changing unit migrates every
real web consumer immediately; all four old cards are counted before their final removal.
The 0017 budget is 45 handwritten product subjects, with explicit per-unit path lists.
No earlier export survives solely for tests. U4 deletes this spec's temporary shape.

The planning session also confirmed canonical Result for hold and reread. A custody error carries
typed row context; admission failure retains the admitted-run owner's error.code. Only a successful
missing row or changed kind yields MODEL_ACCOUNT_CHANGED. The shared error/result names were confirmed with 0019's writer through pushed shape 3395649f: Result<T,E> has both parameters required; E admits table-coded domain context. Failure extends MastraError with id; account connection is a result projection. Internal row context is not another shared owner.

The OpenRun port is necessary because refresh runs after the original model-resolution transaction
ends. Builder supplies a fresh admission for each reread and OAuth swap. The model-account core
never imports Builder or joins Builder's run-account records. A deactivated person or ended run
receives no tokens from a later reread, including single-flight waiters.

Compare-and-swap on the spent sealed value closes refresh against a new sign-in or another refresh.
Generation checks prevent an old refusal or Google capture from writing a replacement row.
OAuth call-time 401 forces one refresh; only a refused refresh marks the row. Router/configuration,
network, timeout, 403, 429 and 5xx faults do not turn a healthy sign-in into a refused row.

The installed SDK does not expose refresh failures as structured status and does not accept fetch.
The approved local token request copies its payload and classifies the HTTP response at that edge.
An installed-package drift check pins the copied constants. It is removed when a native structured
refresh API can replace it. Google retains the pinned CLIProxyAPI protocol, one process per account
sign-in generation and a one-minute capture job. Real token rotation remains a deciding live proof,
which needs separate operator authorization.

## Evidence

The private study holds the notebook, audit, Factory traces, census, architectural candidates and
spikes. Those files and their machine locations never enter this public repository.

- The study's AAD spike ran: same context opens, changed owner/scope/provider/kind fails, old
  context-free values fail, stale same-row values still open and retired configured keys work.
  That last case explains why AAD does not replace compare-and-swap.
- The schema spike ran on disposable PostgreSQL: illegal scope, ownership and provider/kind rows
  failed with 23514; duplicate slots failed with 23505; missing person ownership failed with 23503.
- Installed SDK probes ran without external calls: generate/stream preserve APICallError status;
  401/403 are not retried; 500/network faults are retried; native refresh loses structured cause.
- The original Opus/Sonnet review found the rollback-lost refusal mark, IAM name/email disclosure
  and retry-invalidated Google ticket. The approved design resolves all three.
- The resumed census reads the accepted branch plus the main flow merge. It reports 23 account,
  provider/card and contract files; 42 top-level arrows, 3 functions over 80 lines, 3 suppressions,
  5 plain string id declarations, 3 local JSON parsers and 16 legacy Builder account files. The corrected custody scan finds 72 live legacy matches; follow-up additionally finds four old cards and six provider login-state/Caller aliases.
  The script is `shape/census.mjs`; final targets are zero and its check moves to CI in U4. Foundation checks exclude web subjects delivered by 0020; follow-up baselines are recorded on merged 0017.
- The pushed 0018 shape was read at `3d70bd7b` and contains the retained run/system/bootstrap
  variants. 0019 was then checked at 3395649f, including Result/Code, AccountConnectionAnswer and native failureResponse. Both shapes use the required two-parameter Result signature and its structural error constraint. Exact shared exports must exist before build;
  the type-only dependency preview in shape is never implemented or copied into product code.
- The rewrite's shape compiles with the pinned toolchain, including negative cases for credential
  pairs/values, model ids, nominal/read/write proofs, seal owners and canonical result variants. The follow-up also checks login state, per-job proof and same-kind swap.
  This proves static contracts, not provider or runtime behavior. Each card names its runtime proof.

## Rewrite review and verification

The initial Opus/Sonnet interrogate found the oversized core/command unit, non-native model type,
broad system proofs, kind-changing swap, an impossible JSON census target, a later-unit custody
type, incomplete web consumers, migration reset ambiguity, shape import staleness and weak negative
cases. All were acted on: the operator split the waves; types/negative cases and cards now match
native/merged owners; migration deletes session rows before new CHECK validation; shape checks
and all real consumers move with each replacing unit. The reviewer request to brand RunOwner
inside this wave was dismissed because it is exactly 0018's existing upstream owner.

The configured independent follow-up reviewers found a self-counting/wrong-prefix census, a held
row/credential kind mismatch, stale Google 401 marks, Google replacement wording and a superseded
sign-in completion race. The corrections add AST-aware scanning and exact historical exceptions,
full pair correlation and negative fixtures, spent-secret conditions on every mark, admitted
same-kind adoption before dispatch without request replay, and same-attempt serialization through
completion commit. Historical 0070/0071 tests retain their original meaning. Failure-table rows are generated in the first unit using their codes: SECRET_CUSTODY_LOST in 0017 U3 and model-account run codes/actions in 0020 U2. All findings have a
recorded action or evidence-backed dismissal with the planning session.

Both shapes compile with the pinned toolchain. Twenty-two clean-final/defect census scenarios
pass, including license comments, dictionary/historical fixtures, actual old prefix in a regex,
wrong live variable names, each structural defect and the follow-up duplicate subjects.
Documentation validation passed 221 repository tests. The existing verify:quick checks passed.
These are spec/type/checker proofs; no installation feature or real provider use is claimed built.

## References

Each mechanism's kept/adapted facts and file:line are in index.md's References copied table.

- Mastra fork at `ce7e9c30c1`, `mastracode/factory/src/storage/domains/credentials/base.ts:96-118,292-319`;
  `routes/config.ts:766-777`; `routes/oauth.ts:295-297,356-362,416-422`;
  `factory-ui/src/ui/domains/settings/components/ProviderAccessSection.tsx:63-114`.
- Installed `@mastra/code-sdk` 1.8.3, `dist/auth/types.d.ts:4-9,74-81`;
  `dist/auth/providers/anthropic.js:18-20,131-156`;
  `dist/auth/providers/openai-codex.js:36-39,160-226,483-491,543`.
- Mastra core, `packages/core/src/llm/model/provider-registry.ts:392-413`.
- cal.com, `packages/lib/crypto/keyring.ts:90,121`;
  `packages/features/credentials/services/CredentialDataService.ts:26-32`;
  `packages/prisma/schema.prisma:329`; `packages/app-store/webex/lib/VideoApiAdapter.ts:285-293`.
- Tink, context binding, `https://developers.google.com/tink/bind-ciphertext`;
  AWS KMS encryption context, `https://docs.aws.amazon.com/kms/latest/developerguide/least-privilege.md`.
- Conexus guides C, A, P, D, H, S, V, T and L; decisions C-024, C-026, C-027 and C-032;
  registry/module.ts:8-39 and connectors/store.ts:86-105 at `017133fc`.
